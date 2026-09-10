import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import test from 'node:test';
import { createStudio } from './studio.mjs';
import { openJobs, runWorkflow, workflowInput } from './workflow.mjs';
import { wavFixture } from './wav-fixture.mjs';
import { verifyExport } from './export-lineage.mjs';
const input = { request: { prompt: 'A short tone', duration_seconds: 1, seed: 42 } };
const plan = { version: 'prompt-plan-v2', status: 'completed', error: null, intent: input.request.prompt, model: 'synthetic-test', instructions_sha256: 'a'.repeat(64), generation_prompts: ['A tone.', 'A short tone.', 'A brief tone.', 'A clear tone.', 'A tone sounds.'] };
const wave = wavFixture(t => t > .1 && t < .3 || t > .6 && t < .8);
const silence = Buffer.from(wave); silence.fill(0, 44);
function fixture(root) {
  return { root, token: 'fixture', port: 0, computePort: 0, fixture: true, setup: async () => {}, preparePrompts: async () => plan,
    backend: { start: async () => {}, stop: async () => {}, reset: async () => {}, unload: async () => {}, generate: async () => wave } };
}
if (process.argv[2] === '--crash') {
  const root = process.argv[3], phase = process.argv[4];
  const options = fixture(root);
  options.backend.generate = async () => { appendFileSync(join(root, 'generations'), '1\n'); return wave; };
  const jobs = await openJobs({ ...options, execute: (job, execution) => runWorkflow(job, { ...execution, save: async () => {
    await execution.save(); const id = job.attempts.at(-1).candidate_id;
    if (id) { const c = execution.store.loadCandidate(id); if (phase === 'source' && !c.evidence.analyses.length || phase === 'cut' && c.evidence.cut) process.exit(23); }
  } }) });
  await jobs.submit('crash', input); await jobs.wait(); throw new Error('Checkpoint not reached');
} else {
  test('five variations retain failures, cap retries, export exact selections, and recreate once with the selected prompt', async () => {
    const root = await mkdtemp(resolve('.runtime/batch-test-'));
    const options = fixture(root); let planned = 0; const requests = [];
    options.preparePrompts = async () => { planned++; return plan; };
    options.backend.generate = async request => { requests.push(request); return requests.length <= 4 ? silence : wave; };
    let studio = await createStudio(options);
    try {
      for (const old of [{ mode: 'automatic' }, { budget: { attempts: 3 } }, { qa: { clap: true, target: 'tone' } }]) assert.throws(() => workflowInput({ ...input, ...old }), /removed/);
      const job = await studio.jobs.submit('batch', input); await studio.jobs.wait();
      assert.equal(job.status, 'completed', job.error); assert.equal(job.outcome, 'exhausted');
      assert.equal(planned, 1); assert.equal(requests.length, 8);
      assert.deepEqual(job.variants.map(v => v.attempt_ids.length), [3, 2, 1, 1, 1]);
      assert.deepEqual(requests.map(r => r.prompt), [plan.generation_prompts[0], plan.generation_prompts[0], plan.generation_prompts[0], plan.generation_prompts[1], ...plan.generation_prompts.slice(1)]);
      assert.equal(new Set(requests.map(r => r.seed)).size, 8);
      assert.ok(job.attempts.every(a => a.result && studio.jobs.store.loadCandidate(a.result.candidate_sha256)));
      const id = job.variants[1].result.candidate_sha256;
      const candidate = studio.jobs.store.loadCandidate(id);
      assert.equal(candidate.evaluation, null);
      assert.ok(candidate.evidence.cut.bounds.end_sample < .5 * 44100, 'first active region');
      verifyExport(candidate.evidence, studio.jobs.store.readAsset(id, 'audio'), () => wave);
      const first = studio.jobs.selectTake(id, { event_id: 'a'.repeat(32), supersedes: null });
      assert.deepEqual(studio.jobs.selectTake(id, { event_id: first.event_id, supersedes: null }), first);
      const trim = await studio.jobs.cut(id, { start_seconds: .1, end_seconds: .25 });
      const second = studio.jobs.selectTake(trim.candidate_sha256, { event_id: 'b'.repeat(32), supersedes: first.event_id });
      assert.throws(() => studio.jobs.selectTake(id, { event_id: 'c'.repeat(32), supersedes: first.event_id }), /Stale/);
      assert.equal(studio.jobs.store.history(id).length, 0, 'preference never rejects another take');
      const url = `http://127.0.0.1:${studio.server.address().port}`;
      const exported = await fetch(`${url}/studio/candidates/${trim.candidate_sha256}/export`, { headers: { Authorization: 'Bearer fixture' } });
      const archive = join(root, 'export.tar'); await writeFile(archive, Buffer.from(await exported.arrayBuffer()));
      const history = spawnSync('tar', ['-xOf', archive, './selection-history.json'], { encoding: 'utf8' });
      assert.equal(history.status, 0, history.stderr); assert.equal(JSON.parse(history.stdout).at(-1).event_id, second.event_id);
      const retry = await studio.jobs.recreate(trim.candidate_sha256, 'paid-recreation'); await studio.jobs.wait();
      assert.equal(retry.status, 'completed', retry.error); assert.equal(retry.provider, 'elevenlabs');
      assert.equal(retry.sound_id, job.sound_id); assert.equal(retry.attempts.length, 1); assert.equal(planned, 1);
      assert.equal(requests.at(-1).prompt, plan.generation_prompts[1]); assert.equal(requests.at(-1).duration_seconds, 1);
      assert.equal((await studio.jobs.recreate(trim.candidate_sha256, 'paid-recreation')).id, retry.id); assert.equal(requests.length, 9);
      await studio.close(); studio = await createStudio(options);
      assert.equal((await studio.jobs.submit('batch', input)).id, job.id); assert.equal(requests.length, 9);
      assert.equal(studio.jobs.selectionHistory(id).at(-1).candidate_sha256, trim.candidate_sha256);
    } finally { await studio.close(); await rm(root, { recursive: true, force: true }); }
  });
  test('only signal failures retry; operational errors and cancellation stop remaining work', async () => {
    for (const kind of ['static', 'paid-static', 'error', 'cancel']) {
      const root = await mkdtemp(resolve('.runtime/batch-stop-')); let calls = 0, entered;
      const boundary = new Promise(r => { entered = r; });
      const jobs = await openJobs({ ...fixture(root), execute: async (_, { signal }) => {
        calls++; entered();
        if (kind === 'error') throw new Error('Controlled provider error');
        if (kind === 'cancel') { await new Promise(r => signal.addEventListener('abort', r, { once: true })); signal.throwIfAborted(); }
        return { outcome: 'signal_failed', reason_tags: ['suspected_static'] };
      } });
      try {
        const job = await jobs.submit(kind, { ...input, ...(kind === 'paid-static' ? { provider: 'elevenlabs' } : {}) });
        if (kind === 'cancel') { await boundary; await jobs.cancel(job.id); }
        await jobs.wait(); assert.equal(calls, kind === 'static' ? 15 : 1);
        assert.equal(job.outcome, kind === 'cancel' ? 'cancelled' : kind === 'error' ? 'operational-error' : 'exhausted');
      } finally { await jobs.close(); await rm(root, { recursive: true, force: true }); }
    }
  });
  test('hard restart reuses published source and cut without replaying generation or planning', async () => {
    for (const phase of ['source', 'cut']) {
      const root = await mkdtemp(resolve('.runtime/batch-recovery-'));
      const child = spawnSync(process.execPath, [resolve('quality-loop.test.mjs'), '--crash', root, phase], { timeout: 30000, encoding: 'utf8' });
      assert.equal(child.status, 23, child.stderr + child.stdout);
      let generated = 0; const options = fixture(root);
      options.preparePrompts = async () => { throw new Error('Plan must be reused'); };
      options.backend.generate = async () => { generated++; return wave; };
      const jobs = await openJobs(options);
      try { const job = jobs.list()[0]; assert.equal(job.status, 'interrupted'); await jobs.recover(job.id); await jobs.wait();
        assert.equal(job.status, 'completed', job.error); assert.equal(generated, 4); assert.equal(job.attempts.length, 5);
        assert.equal((await readFile(join(root, 'generations'), 'utf8')).trim(), '1');
      } finally { await jobs.close(); await rm(root, { recursive: true, force: true }); }
    }
  });
}
