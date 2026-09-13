import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createStudio } from './studio.mjs';
import { wavFixture } from './wav-fixture.mjs';
import { hash, validateRun } from './dist/config.js';
import { inspectWav } from './dist/wav.js';
import { verifyExport } from './export-lineage.mjs';

const interval = { url: 'https://www.youtube.com/watch?v=CBDZg1Jb_T4', start_seconds: 120, end_seconds: 125 };
const plan = async intent => ({ version: 'prompt-plan-v2', intent, status: 'completed', error: null, model: 'fixture', instructions_sha256: 'a'.repeat(64), generation_prompts: Array.from({ length: 5 }, (_, i) => `${intent} variant ${i}`) });
const settings = root => ({ root, port: 0, computePort: 0, token: 'youtube-test', fixture: true, setup: async () => {}, preparePrompts: plan,
  youtubeReadiness: async () => ({ ready: true, tools: [] }), searchYoutube: async () => [{ id: 'CBDZg1Jb_T4', title: 'Rain', url: interval.url }],
  backend: { start: async () => {}, stop: async () => {}, reset: async () => {}, unload: async () => {}, generate: async r => wavFixture(undefined, r.duration_seconds) },
  acquireYoutube: async (input, dir, { stage }) => { await stage('Downloading audio window'); const file = join(dir, 'audio.wav'); await writeFile(file, wavFixture(t => t > 0.5 && t < 4.5, input.end_seconds - input.start_seconds)); return { file }; } });
async function until(check, budget = 60000) { const end = Date.now() + budget; while (Date.now() < end) { const value = await check(); if (value) return value; await new Promise(r => setTimeout(r, 25)); } throw new Error('Expected workflow condition did not complete'); }
const request = { name: 'Import verification', sounds: [{ key: 'rain', prompt: 'Rain on a window', duration_seconds: 5 }, { key: 'gate', prompt: 'Gate closing', duration_seconds: 5 }] };
const takeGroups = async (records, jobs) => {
  const script = await readFile('studio.js', 'utf8');
  return vm.runInNewContext(script.slice(script.indexOf('function formatDuration('), script.indexOf('const takeFor =')) + '\ngroupTakes(records, jobs)', { records, jobs });
};
if (process.argv[2] === '--crash') {
  const [root, point] = process.argv.slice(3);
  const studio = await createStudio({ ...settings(root), execute: async () => { throw new Error('Initial generation unavailable'); } });
  const batch = await studio.batches.submit('crash-batch', { ...request, sounds: [request.sounds[0]] });
  await until(() => studio.jobs.get(batch.sounds[0].sound_id)?.status === 'failed');
  const save = studio.jobs.store.saveCandidate;
  studio.jobs.store.saveCandidate = (...args) => { const c = save(...args); if (Boolean(c.evidence.cut) === (point === 'delivery')) process.exit(23); return c; };
  await studio.batches.youtube(batch.id, 'rain', 'crash-import', interval);
} else {
  test('mixed batch imports preserve ownership, intent, exact versions, queue, auth and recovery', async () => {
    const root = await mkdtemp(resolve('.runtime/youtube-integration-'));
    let acquisitionCount = 0, generationCount = 0, mode = 'ok', failDelivery = false;
    const opts = settings(root), acquire = opts.acquireYoutube, generate = opts.backend.generate;
    opts.backend.generate = async r => { generationCount++; return generate(r); };
    opts.acquireYoutube = async (input, dir, options) => {
      acquisitionCount++;
      if (mode === 'fail') throw new Error('YouTube extraction unavailable');
      if (mode === 'wait') { await options.stage('Downloading audio window'); await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })); }
      return acquire(input, dir, options);
    };
    opts.setup = async () => { if (failDelivery) throw new Error('Delivery tool unavailable'); };
    let studio = await createStudio(opts), origin = `http://127.0.0.1:${studio.server.address().port}`;
    const call = (path, value, key, headers = { Authorization: 'Bearer youtube-test' }) => fetch(origin + '/studio/' + path, { method: value === undefined ? 'GET' : 'POST', headers: { ...headers, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    try {
      const batch = await studio.batches.submit('integration-batch', request), base = `batches/${batch.id}`;
      await until(() => studio.batches.get(batch.id).status === 'awaiting_review');
      assert.equal(generationCount, 10);
      const originals = studio.jobs.store.listCandidates().map(c => c.candidate_sha256);
      for (const [i, sound] of studio.batches.get(batch.id).sounds.entries()) {
        const c = studio.jobs.get(sound.sound_id).variants[0].result.candidate_sha256;
        assert.equal((await call(`candidates/${c}/select`, { event_id: String(i + 1).repeat(32), supersedes: null })).status, 200);
      }
      const oldWinners = studio.batches.winners(batch.id);
      assert.equal((await call('youtube/search', { query: 'rain' }, undefined, {})).status, 401);
      assert.equal((await call('youtube/search', { query: 'rain' }, undefined, { Authorization: 'Bearer youtube-test', Origin: origin })).status, 403);
      const bootstrap = await fetch(origin + '/studio/session', { headers: { 'X-Studio-Bootstrap': '1' } });
      const cookie = bootstrap.headers.get('set-cookie').split(';')[0], csrf = (await bootstrap.json()).csrf;
      assert.equal((await call('youtube/search', { query: 'rain' }, undefined, { Cookie: cookie, Origin: origin })).status, 403);
      assert.equal((await call('youtube/search', { query: 'rain' }, undefined, { Cookie: cookie, Origin: origin, 'X-Studio-CSRF': csrf })).status, 200);
      assert.equal((await call(base + '/sounds/rain/youtube', { ...interval, url: 'https://127.0.0.1/a' }, 'bad')).status, 400);
      assert.equal((await call(base + '/sounds/rain/youtube', { ...interval, end_seconds: 120 }, 'bad')).status, 400);
      await studio.batches.pause(batch.id, true);
      const path = base + '/sounds/rain/youtube';
      const [a, b] = await Promise.all([call(path, interval, 'import-one'), call(path, interval, 'import-one')]);
      assert.equal(a.status, 202); assert.equal(b.status, 202);
      const accepted = await a.json(), op = accepted.sounds[0].operations.at(-1);
      assert.equal((await b.json()).sounds[0].operations.at(-1).job_id, op.job_id);
      assert.equal(acquisitionCount, 0);
      assert.equal((await call(path, { ...interval, end_seconds: 124 }, 'import-one')).status, 409);
      assert.equal((await call(base + '/sounds/gate/youtube', interval, 'import-one')).status, 409);
      assert.equal((await call(path, interval, 'cancel-queued')).status, 202);
      const queued = studio.batches.get(batch.id).sounds[0].operations.at(-1);
      assert.equal((await call(`jobs/${queued.job_id}/cancel`, {})).status, 202);
      await studio.batches.pause(batch.id, false);
      await until(() => studio.jobs.get(op.job_id)?.status === 'completed');
      const job = studio.jobs.get(op.job_id), c = studio.jobs.store.loadCandidate(job.result.candidate_sha256);
      assert.equal(acquisitionCount, 1); assert.equal(generationCount, 10);
      assert.equal(job.attempts.length, 1); assert.equal(job.variants.length, 1);
      assert.equal(job.input.request.seed, undefined); assert.equal(job.attempts[0].seed, undefined); assert.equal(job.used_seeds, undefined);
      assert.equal(job.sound_id, batch.sounds[0].sound_id);
      assert.deepEqual(job.input.request, { prompt: request.sounds[0].prompt, duration_seconds: 5 });
      assert.equal(validateRun(c.evidence.generation), true);
      const invalid = structuredClone(c.evidence.generation); invalid.request.seed = 42;
      assert.equal(validateRun(invalid), false, 'imports cannot claim a seed');
      delete invalid.request.seed; invalid.licenses = [{ name: 'Invented', url: 'https://example.com' }];
      assert.equal(validateRun(invalid), false, 'imports cannot invent source licenses');
      const falseProperties = structuredClone(c); delete falseProperties.candidate_sha256;
      falseProperties.evidence.generation.audio.seconds = 4;
      assert.throws(() => studio.jobs.store.saveCandidate(falseProperties, studio.jobs.store.readAsset(c.candidate_sha256, 'source'), studio.jobs.store.readAsset(c.candidate_sha256, 'audio')), /properties mismatch/);
      const source = studio.jobs.store.readAsset(c.candidate_sha256, 'source');
      assert.deepEqual(source, wavFixture(t => t > 0.5 && t < 4.5, 5));
      assert.equal(c.evidence.cut.bounds.start_sample, 0); assert.equal(c.evidence.cut.bounds.end_sample, 220500);
      assert.equal(studio.batches.winners(batch.id).revision, oldWinners.revision);
      for (const id of originals) studio.jobs.store.loadCandidate(id);
      const groups = await takeGroups(studio.jobs.store.listCandidates(), studio.jobs.list());
      assert.equal(groups.filter(t => t.sound === job.sound_id).length, 6);
      assert.equal(groups.find(t => t.job.id === job.id).number, 6);
      const trim = await studio.jobs.cut(c.candidate_sha256, { start_seconds: 1, end_seconds: 3, gain_db: -6, loop: false });
      assert.equal(inspectWav(studio.jobs.store.readAsset(trim.candidate_sha256, 'audio')).seconds, 2);
      assert.equal(trim.attempt_id, c.attempt_id); assert.equal(studio.batches.winners(batch.id).revision, oldWinners.revision);
      const loop = await studio.jobs.cut(c.candidate_sha256, { start_seconds: 0.5, end_seconds: 4.5, loop: true, crossfade_seconds: 0.25, gain_db: 3 });
      assert.equal(loop.evidence.cut.loop.output_frames, 165375);
      assert.equal((await call(`candidates/${loop.candidate_sha256}/select`, { event_id: '3'.repeat(32), supersedes: '1'.repeat(32) })).status, 200);
      const winner = studio.batches.winners(batch.id).sounds[0];
      assert.equal(winner.candidate_sha256, loop.candidate_sha256);
      assert.equal(hash(Buffer.from(await (await fetch(winner.audio_url, { headers: { Authorization: 'Bearer youtube-test' } })).arrayBuffer())), winner.audio_sha256);
      const library = await (await call('library')).json();
      assert.ok(library.some(entry => entry.candidate_sha256 === loop.candidate_sha256));
      verifyExport(loop.evidence, studio.jobs.store.readAsset(loop.candidate_sha256, 'audio'), () => source);
      assert.equal((await call(`candidates/${loop.candidate_sha256}/export`)).status, 200);
      // Fractional interval is independent of generation presets and remains another take.
      await call(path, { ...interval, start_seconds: 1.125, end_seconds: 1.225 }, 'tiny');
      const tinyOp = studio.batches.get(batch.id).sounds[0].operations.at(-1);
      await until(() => ['completed', 'failed'].includes(studio.jobs.get(tinyOp.job_id)?.status));
      assert.equal(studio.jobs.get(tinyOp.job_id).status, 'completed', studio.jobs.get(tinyOp.job_id).error);
      assert.equal(studio.jobs.store.loadCandidate(studio.jobs.get(tinyOp.job_id).result.candidate_sha256).evidence.generation.audio.seconds, 0.1);
      mode = 'fail'; await call(path, interval, 'failure');
      await until(() => studio.batches.get(batch.id).sounds[0].operations.at(-1).status === 'failed');
      assert.equal(studio.batches.get(batch.id).status, 'ready');
      mode = 'wait'; await call(path, interval, 'cancel-active');
      const cancelOp = studio.batches.get(batch.id).sounds[0].operations.at(-1);
      await until(() => studio.jobs.get(cancelOp.job_id)?.progress === 'Downloading audio window');
      await call(`jobs/${cancelOp.job_id}/cancel`, {}); await studio.jobs.wait();
      assert.equal(studio.jobs.get(cancelOp.job_id).status, 'canceled'); assert.equal(studio.batches.get(batch.id).status, 'ready');
      mode = 'ok'; failDelivery = true; await call(path, interval, 'delivery-retry');
      const retryOp = studio.batches.get(batch.id).sounds[0].operations.at(-1);
      await until(() => studio.jobs.get(retryOp.job_id)?.status === 'failed');
      const count = acquisitionCount;
      failDelivery = false; await call(`jobs/${retryOp.job_id}/recover`, {}); await studio.jobs.wait();
      assert.equal(studio.jobs.get(retryOp.job_id).status, 'completed'); assert.equal(acquisitionCount, count, 'reuses retained source');
      await studio.batches.revise(batch.id, 'rain', 'later-generation', { prompt: 'Rain on a window', duration_seconds: 5 });
      await until(() => studio.batches.get(batch.id).status === 'ready'); assert.equal(generationCount, 15);
      assert.equal(studio.jobs.list().at(-1).input.request.duration_seconds, 5);
      await studio.close(); await rm(join(root, 'out'), { recursive: true, force: true });
      studio = await createStudio(opts); origin = `http://127.0.0.1:${studio.server.address().port}`;
      assert.equal(studio.batches.winners(batch.id).sounds[0].candidate_sha256, loop.candidate_sha256);
      assert.equal((await call(`candidates/${loop.candidate_sha256}/export`)).status, 200);
    } finally { await studio.close(); await rm(root, { recursive: true, force: true }); }
  });
  test('imports queue behind generation and preserve later local/ElevenLabs loop intent', async () => {
    const root = await mkdtemp(resolve('.runtime/youtube-queue-'));
    let release, generationCalls = 0, acquisitions = 0;
    const waiting = new Promise(r => { release = r; }), opts = settings(root), acquire = opts.acquireYoutube;
    opts.execute = async job => { generationCalls++; if (generationCalls === 1) await waiting; return { outcome: 'needs_review' }; };
    opts.acquireYoutube = async (...args) => { acquisitions++; assert.equal(generationCalls, 5); return acquire(...args); };
    opts.setup = async generation => assert.equal(generation, false, 'import setup must not request weights');
    const studio = await createStudio(opts);
    try {
      const batch = await studio.batches.submit('queue', { name: 'Queue intent', sounds: [{ key: 'rain', prompt: 'Continuous rain', duration_seconds: 10, loop: true }] });
      await until(() => generationCalls === 1);
      const accepted = await studio.batches.youtube(batch.id, 'rain', 'queued-import', interval);
      const id = accepted.sounds[0].operations.at(-1).job_id;
      assert.equal(accepted.sounds[0].operations.at(-1).status, 'queued'); assert.equal(acquisitions, 0);
      assert.equal(studio.jobs.get(batch.sounds[0].sound_id).status, 'running');
      release(); await until(() => studio.jobs.get(id)?.status === 'completed');
      const candidate = studio.jobs.store.loadCandidate(studio.jobs.get(id).result.candidate_sha256);
      assert.equal(candidate.evidence.generation.request.loop, false);
      await studio.batches.revise(batch.id, 'rain', 'local-after-import', { prompt: 'Continuous rain', duration_seconds: 10 });
      await until(() => studio.batches.get(batch.id).sounds[0].operations.at(-1).status === 'completed');
      assert.equal(studio.jobs.list().at(-1).input.request.loop, true);
      await studio.batches.recreate(batch.id, 'rain', 'paid-after-import', { candidate_sha256: candidate.candidate_sha256 });
      await until(() => studio.batches.get(batch.id).sounds[0].operations.at(-1).status === 'completed');
      const paid = studio.jobs.list().at(-1);
      assert.equal(paid.provider, 'elevenlabs'); assert.equal(paid.input.request.prompt, 'Continuous rain'); assert.equal(paid.input.request.duration_seconds, 10); assert.equal(paid.input.request.loop, true);
      assert.equal(acquisitions, 1); assert.equal(paid.attempts.length, 1);
    } finally { release(); await studio.close(); await rm(root, { recursive: true, force: true }); }
  });
  test('hard restart after source/candidate commit resumes the same take without acquisition or generation replay', async () => {
    for (const point of ['source', 'delivery']) {
      const root = await mkdtemp(resolve('.runtime/youtube-commit-'));
      const child = spawnSync(process.execPath, [resolve('youtube-integration.test.mjs'), '--crash', root, point], { timeout: 45000, encoding: 'utf8' });
      assert.equal(child.status, 23, child.stderr + child.stdout);
      let calls = 0;
      const studio = await createStudio({ ...settings(root), acquireYoutube: async () => { calls++; throw new Error('Unexpected redownload'); }, execute: async () => { throw new Error('Unexpected generation'); } });
      try {
        const batch = studio.batches.list()[0], id = batch.sounds[0].operations.at(-1).job_id;
        await until(() => studio.jobs.get(id)?.status === 'completed');
        assert.equal(calls, 0); assert.equal(studio.jobs.get(id).attempts.length, 1);
        const groups = await takeGroups(studio.jobs.store.listCandidates(), studio.jobs.list());
        assert.equal(groups.length, 1); assert.equal(groups[0].sound, batch.sounds[0].sound_id);
      } finally { await studio.close(); await rm(root, { recursive: true, force: true }); }
    }
  });
}
