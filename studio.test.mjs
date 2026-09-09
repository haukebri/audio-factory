import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { get, createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createStudio } from './studio.mjs';
import { runWorkflow, openJobs } from './workflow.mjs';
import { wavFixture } from './wav-fixture.mjs';
import { verifyExport } from './export-lineage.mjs';
import { hash } from './dist/config.js';
import { processIdentity } from './dist/ownership.js';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await check(); if (value) return value; await pause(25); }
  throw new Error('Condition deadline exceeded');
}
function controlledBackend() {
  let child, count = 0;
  const pids = [];
  return {
    pids, get count() { return count; },
    async start() {}, async unload() {},
    async reset() { await this.stop(); },
    async stop() {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = new Promise(resolve => child.once('exit', resolve));
        child.kill('SIGTERM'); await exited;
      }
    },
    async generate(request, progress) {
      count++;
      const bytes = wavFixture();
      child = spawn(process.execPath, ['-e', `setTimeout(() => process.stdout.write(Buffer.from('${bytes.toString('base64')}','base64')), 600)`], { stdio: ['ignore', 'pipe', 'pipe'] });
      pids.push(child.pid);
      progress({ status: 'controlled-child', pid: child.pid });
      console.log(`Owned synthetic generation ${count}: pid=${child.pid}, seed=${request.seed}, source=${hash(bytes)}`);
      const chunks = [];
      child.stdout.on('data', chunk => chunks.push(chunk));
      await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error('Controlled generation stopped'))); });
      return Buffer.concat(chunks);
    },
  };
}
const request = { prompt: '<img src=x onerror="window.promptInjected=true"> synthetic tone', duration_seconds: 1, seed: 42 };
const input = { request, qa: { clap: false } };
const token = 'controlled-private-token';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

if (process.argv.includes('--browser-fixture')) {
  const root = await mkdtemp(resolve('.runtime/studio-browser-'));
  const backend = controlledBackend();
  const studio = await createStudio({ root, token, port: 0, computePort: 0, fixture: true, backend, setup: async () => {} });
  const url = `http://127.0.0.1:${studio.server.address().port}`;
  await studio.jobs.submit('browser-fixture', input);
  await studio.jobs.wait();
  assert.equal(studio.jobs.list()[0].status, 'completed');
  const manifest = { root, url, pid: process.pid, candidates: studio.jobs.store.listCandidates().map(c => c.candidate_sha256) };
  await writeFile('.test-artifacts/m02-studio-browser.json', JSON.stringify(manifest));
  console.log(JSON.stringify(manifest));
  process.once('SIGTERM', async () => { await studio.close(); await rm(root, { recursive: true, force: true }); console.log(`Removed browser fixture ${root}`); });
} else {
  test('resume conflicts preserve interruption and retries attach to one replacement', async () => {
    const root = await mkdtemp(resolve('.runtime/studio-resume-test-'));
    let executions = 0;
    const options = { root, token, execute: async () => { executions++; return {}; } };
    let jobs = await openJobs(options);
    try {
      await jobs.submit('occupied', { ...input, request: { ...request, prompt: 'Different request' } });
      await jobs.wait();
      const original = await jobs.submit('interrupted', input);
      await jobs.wait();
      await jobs.close();
      original.status = 'running';
      await writeFile(`${root}/.runtime/studio/jobs/${original.id}.json`, JSON.stringify(original));
      jobs = await openJobs(options);
      await assert.rejects(jobs.resume(original.id, 'occupied'), /conflict/i);
      await assert.rejects(jobs.submit('accidental', input), /explicit resume/);
      assert.equal(jobs.get(original.id).resumed_by, undefined);
      const replacement = await jobs.resume(original.id, 'replacement');
      await jobs.wait();
      await jobs.close();
      jobs = await openJobs(options);
      assert.equal((await jobs.resume(original.id, 'replacement')).id, replacement.id);
      await assert.rejects(jobs.resume(original.id, 'duplicate-replacement'), /already resumed/i);
      assert.equal(executions, 3);
    } finally {
      await jobs.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  test('studio shared workflow, auth, playback/export, cancellation and durable recovery (controlled smoke)', async () => {
    const root = await mkdtemp(resolve('.runtime/studio-test-'));
    console.log(`Created isolated studio root ${root}`);
    const backend = controlledBackend();
    const options = { root, token, port: 0, computePort: 0, fixture: true, backend, setup: async () => {} };
    let studio = await createStudio(options);
    let url = `http://127.0.0.1:${studio.server.address().port}`;
    const call = (path, value, extra = {}) => fetch(url + path, { method: value === undefined ? 'GET' : 'POST', headers: { ...headers, ...extra }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    const submit = (key, value = input) => call('/studio/jobs', value, { 'Idempotency-Key': key });
    try {
      await assert.rejects(openJobs({ root, token }), /already owned/);
      await assert.rejects(createStudio({ ...options, port: studio.server.address().port }), /EADDRINUSE/);
      const unrelated = createServer((req, res) => res.end('unrelated'));
      await new Promise(resolve => unrelated.listen(0, '127.0.0.1', resolve));
      const preflight = root + '/preflight';
      await mkdir(preflight + '/out', { recursive: true });
      await writeFile(preflight + '/out/sentinel', 'wanted output');
      try {
        await assert.rejects(runWorkflow({ id: 'a'.repeat(32), input, candidate_ids: [] }, {
          root: preflight, token, store: studio.jobs.store, save: async () => {}, signal: new AbortController().signal,
          backend, setup: async () => { throw new Error('setup must not run on occupied port'); }, computePort: unrelated.address().port,
        }), /EADDRINUSE/);
        assert.equal(await readFile(preflight + '/out/sentinel', 'utf8'), 'wanted output');
        assert.equal(await (await fetch(`http://127.0.0.1:${unrelated.address().port}`)).text(), 'unrelated');
      } finally { unrelated.closeAllConnections(); await new Promise(resolve => unrelated.close(resolve)); }
      assert.equal((await fetch(url + '/studio/jobs')).status, 401);
      assert.equal(await new Promise(resolve => get(url + '/studio/jobs', { headers: { ...headers, Host: 'evil.test' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); })), 403);
      assert.equal((await call('/studio/jobs', undefined, { Origin: 'http://evil.test' })).status, 403);
      assert.equal((await call('/studio/jobs', undefined, { Origin: url })).status, 403, 'legacy bearer still rejects any browser Origin');
      assert.equal((await fetch(url + '/studio/session')).status, 403);
      const bootstrap = await fetch(url + '/studio/session', { headers: { 'X-Studio-Bootstrap': '1' } });
      const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
      assert.match(bootstrap.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
      const { csrf } = await bootstrap.json();
      const browser = { Cookie: cookie, Origin: url, 'Content-Type': 'application/json', 'Idempotency-Key': 'first' };
      assert.equal((await fetch(url + '/studio/jobs', { method: 'POST', headers: browser, body: JSON.stringify(input) })).status, 403);
      assert.equal((await submit('invalid', { request: { prompt: '' } })).status, 400);
      assert.equal((await submit('invalid', { ...input, output: '/tmp/untrusted' })).status, 400);
      assert.equal((await submit('invalid', { request: { prompt: 'x'.repeat(20000) } })).status, 413);
      const began = Date.now();
      const accepted = await fetch(url + '/studio/jobs', { method: 'POST', headers: { ...browser, 'X-Studio-CSRF': csrf }, body: JSON.stringify(input) });
      assert.equal(accepted.status, 202);
      assert.ok(Date.now() - began < 600, 'identity returned before controlled generation finishes');
      const job = await accepted.json();
      assert.equal(job.input.request.seed, 42);
      assert.equal((await (await submit('first')).json()).id, job.id);
      assert.equal((await submit('first', { ...input, request: { ...request, prompt: 'conflict' } })).status, 409);
      assert.equal((await submit('busy')).status, 429);
      await until(() => backend.count === 1);
      const computePort = await until(async () => {
        // Legacy service remains directly authenticated while the workflow owns compute.
        const lines = execFileSync('lsof', ['-nP', '-a', '-p', String(process.pid), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
        return lines.split('\n').map(line => /127\.0\.0\.1:(\d+)/.exec(line)?.[1]).find(port => port && Number(port) !== studio.server.address().port);
      });
      const legacy = `http://127.0.0.1:${computePort}`;
      assert.equal((await fetch(legacy + '/health', { headers })).status, 200);
      assert.equal((await fetch(legacy + '/health', { headers: { ...headers, Origin: url } })).status, 403);
      await studio.jobs.wait();
      const complete = await (await call('/studio/jobs/' + job.id)).json();
      assert.equal(complete.status, 'completed', complete.error);
      assert.equal(backend.count, 1);
      assert.equal(complete.progress, 'cutting');
      assert.ok(complete.candidate_ids.length >= 2);
      const candidateId = complete.result.candidate_sha256;
      const candidate = studio.jobs.store.loadCandidate(candidateId);
      assert.equal(candidate.fixture, true);
      assert.equal((await (await call('/studio/jobs')).json()).length, 1, 'studio remains available after compute exits');
      await assert.rejects(fetch(legacy + '/health', { signal: AbortSignal.timeout(1000) }));
      for (const path of ['/studio/candidates/' + 'f'.repeat(64) + '/audio', '/studio/candidates/../../token', '/studio/candidates/%2e%2e%2ftoken', '/studio/candidates/' + candidateId + '/token'])
        assert.equal((await call(path)).status, 404);
      const range = await fetch(url + '/studio/candidates/' + candidateId + '/audio', { headers: { Cookie: cookie, Range: 'bytes=0-43' } });
      assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 44);
      assert.equal(range.headers.get('access-control-allow-origin'), null);
      const feedback = { event_id: randomBytes(16).toString('hex'), candidate_sha256: candidateId, supersedes: null, actor: 'human', verdict: 'rejected', reason_tags: ['artifacts'], note: 'Synthetic fixture feedback; no human listening' };
      const feedbackPath = '/studio/candidates/' + candidateId + '/feedback';
      assert.equal((await call(feedbackPath, feedback)).status, 200);
      assert.equal((await call(feedbackPath, feedback)).status, 200);
      assert.equal((await call(feedbackPath, { ...feedback, event_id: randomBytes(16).toString('hex') })).status, 409);
      const archive = Buffer.from(await (await call('/studio/candidates/' + candidateId + '/export')).arrayBuffer());
      const exported = root + '/exported'; await mkdir(exported);
      execFileSync('tar', ['-xf', '-', '-C', exported], { input: archive });
      const metadata = JSON.parse(await readFile(`${exported}/${candidate.evidence.cut.id}.json`));
      verifyExport(metadata, await readFile(`${exported}/${metadata.cut.id}.wav`), () => studio.jobs.store.readAsset(candidateId, 'source'));
      assert.equal(JSON.parse(await readFile(exported + '/feedback.json')).length, 1);
      console.log(`Verified exported candidate ${candidateId}; tar SHA-256=${hash(archive)}`);

      // Completed generation left before candidate publication must be rescued before cleanup.
      const orphanId = 'a'.repeat(32);
      const orphanDirectory = `${root}/out/runs/${orphanId}`;
      await mkdir(orphanDirectory);
      await writeFile(orphanDirectory + '/run.json', JSON.stringify({ ...candidate.evidence.generation, id: orphanId, audio_path: `out/runs/${orphanId}/audio.wav` }));
      await writeFile(orphanDirectory + '/audio.wav', wavFixture());
      const canceled = await (await submit('cancel')).json();
      await until(() => backend.count === 2);
      assert.equal((await call('/studio/jobs/' + canceled.id + '/cancel', {})).status, 202);
      await studio.jobs.wait();
      assert.equal(studio.jobs.get(canceled.id).status, 'canceled');
      assert.ok(studio.jobs.store.listCandidates().some(c => c.evidence.generation.id === orphanId), 'orphan source rescued before cleanup');
      assert.ok(backend.pids.every(pid => !processIdentity(pid)));
      const next = await (await call('/studio/jobs/' + canceled.id + '/resume', {}, { 'Idempotency-Key': 'explicit-resume' })).json();
      await studio.jobs.wait();
      assert.equal(studio.jobs.get(next.id).status, 'completed');
      assert.deepEqual(studio.jobs.store.history(candidateId), [{ ...feedback, timestamp: studio.jobs.store.history(candidateId)[0].timestamp }]);
      assert.ok(studio.jobs.store.readAsset(candidateId, 'audio').length);

      // Crash an independent workflow process after its running/generating record is durable.
      await studio.close();
      const interrupted = { id: hash('crashed').slice(0, 32) };
      assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', `
        import { openJobs } from ${JSON.stringify(new URL('./workflow.mjs', import.meta.url).href)};
        const jobs = await openJobs({ root: ${JSON.stringify(root)}, token: ${JSON.stringify(token)},
          execute: async (job, {save}) => { job.progress = 'generating'; await save(); process.exit(23); } });
        await jobs.submit('crashed', ${JSON.stringify(input)});
        await jobs.wait();
      `], { stdio: 'pipe' }), error => error.status === 23);
      await cp(`${root}/.runtime/studio`, `${root}/relocated/.runtime/studio`, { recursive: true });
      await rm(root + '/out', { recursive: true, force: true });
      studio = await createStudio({ ...options, root: root + '/relocated' });
      url = `http://127.0.0.1:${studio.server.address().port}`;
      assert.equal(studio.jobs.get(interrupted.id).status, 'interrupted');
      assert.equal(backend.count, 3, 'restart never replays generation');
      assert.equal((await submit('accidental-new-job')).status, 409);
      assert.ok(studio.jobs.store.readAsset(candidateId, 'audio').length);
      assert.equal(studio.jobs.store.history(candidateId)[0].verdict, 'rejected');
      const explicit = await call('/studio/jobs/' + interrupted.id + '/resume', {}, { 'Idempotency-Key': 'recover-crashed' });
      assert.equal(explicit.status, 202);
      await until(() => backend.count === 4);
      await studio.close();
      assert.ok(backend.pids.every(pid => !processIdentity(pid)), 'close stops only owned synthetic children');
      await assert.rejects(fetch(url + '/studio/jobs', { headers, signal: AbortSignal.timeout(1000) }));
      const restart = await openJobs({ root: root + '/relocated', token, execute: runWorkflow, backend, computePort: 0, setup: async () => {}, fixture: true });
      assert.equal(restart.list().at(-1)?.status === 'running', false);
      await restart.close();

      // Real setup cancellation escalates only its owned, deliberately stubborn process group.
      const setupRoot = root + '/setup-fixture';
      await mkdir(setupRoot + '/dist', { recursive: true });
      await mkdir(setupRoot + '/.runtime');
      for (const file of ['dist/setup.js', 'dist/config.js', 'config.json', 'config.schema.json', 'request.schema.json', 'run.schema.json'])
        await cp(resolve(file), setupRoot + '/' + file);
      await writeFile(setupRoot + '/package.json', '{"type":"module"}');
      await symlink(resolve('node_modules'), setupRoot + '/node_modules', 'dir');
      await writeFile(setupRoot + '/setup.mjs', `import {writeFileSync} from 'node:fs';
        process.on('SIGTERM',()=>{}); writeFileSync(new URL('./.runtime/pid',import.meta.url),String(process.pid)); setInterval(()=>{},1000);`);
      const { ensureSetup } = await import(pathToFileURL(setupRoot + '/dist/setup.js'));
      const abort = new AbortController();
      const preparing = ensureSetup(false, abort.signal);
      preparing.catch(() => {});
      const setupPid = await until(async () => { try { return Number(await readFile(setupRoot + '/.runtime/pid', 'utf8')); } catch { return false; } });
      const stoppedAt = Date.now(); abort.abort();
      await assert.rejects(preparing, /Setup failed/);
      assert.ok(Date.now() - stoppedAt < 10000);
      assert.equal(processIdentity(setupPid), undefined);
      console.log(`Bounded setup SIGTERM→SIGKILL cleanup verified: pid=${setupPid}`);
    } finally {
      await studio.close(); await backend.stop();
      assert.ok(backend.pids.every(pid => !processIdentity(pid)));
      await rm(root, { recursive: true, force: true });
      assert.ok(!existsSync(root));
      console.log(`Removed owned studio root and all controlled children: ${root}`);
    }
  });
}
