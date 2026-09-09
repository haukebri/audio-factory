// Replay retained audio through the shared workflow; real CLAP, no new generation or human labels.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, cp, rm, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createStudio } from './studio.mjs';
import { hash } from './dist/config.js';

const source = process.argv[2];
if (!source) throw new Error('Usage: node judge-smoke.mjs <retained.wav> [--browser]');
const bytes = await readFile(source);
const root = await mkdtemp(resolve('.runtime/clap-studio-'));
console.log(JSON.stringify({ mutation: 'owned fixture root', root, input_sha256: hash(bytes) }));
const options = { root, token: 'local-controlled-smoke-token', port: 0, computePort: 0, fixture: true,
  backend: { async start() {}, async stop() {}, async unload() {}, async generate() { return bytes; } }, setup: async () => {} };
let studio;
let finalRoot = root;
try {
  studio = await createStudio(options);
  const job = await studio.jobs.submit('real-clap-replayed-audio', { request: { prompt: 'A single dry wooden knock, close and clear.', duration_seconds: .62, seed: 42 } });
  await studio.jobs.wait();
  assert.equal(job.status, 'completed', job.error);
  const candidate = studio.jobs.store.loadCandidate(job.result.candidate_sha256);
  assert.equal(candidate.evaluation.model, 'laion/larger_clap_general');
  assert.equal(candidate.evaluation.evidence.status, 'completed', JSON.stringify(candidate.evaluation));
  assert.equal(candidate.evaluation.audio_sha256, candidate.evidence.cut.audio_sha256);
  assert.equal(candidate.evaluation.evidence.result.audio_sha256, candidate.evaluation.audio_sha256);
  assert.equal(studio.jobs.store.history(candidate.candidate_sha256).length, 0);
  const adjusted = await studio.jobs.cut(candidate.candidate_sha256, { start_seconds: .05, end_seconds: .5 });
  assert.notEqual(adjusted.evaluation.audio_sha256, candidate.evaluation.audio_sha256);
  assert.equal(adjusted.evaluation.audio_sha256, adjusted.evidence.cut.audio_sha256);
  assert.equal(adjusted.evaluation.evidence.status, 'completed');
  const evidence = { root, job, candidate, adjusted };
  await writeFile('.runtime/clap-preflight/studio-smoke.json', JSON.stringify(evidence, null, 2));
  await studio.close();
  finalRoot = root + '-relocated';
  await mkdir(finalRoot);
  await cp(root + '/.runtime', finalRoot + '/.runtime', { recursive: true });
  await rm(root, { recursive: true, force: true });
  studio = await createStudio({ ...options, root: finalRoot });
  assert.deepEqual(studio.jobs.store.loadCandidate(candidate.candidate_sha256), candidate);
  assert.deepEqual(studio.jobs.store.loadCandidate(adjusted.candidate_sha256), adjusted);
  assert.equal(studio.jobs.get(job.id).status, 'completed');
  assert.equal(studio.jobs.store.history(candidate.candidate_sha256).length, 0);
  console.log(JSON.stringify({ status: 'passed', restart_relocation: true, candidate: candidate.candidate_sha256, evaluation: candidate.evaluation }));
  if (process.argv.includes('--browser')) {
    const manifest = { root: finalRoot, url: `http://127.0.0.1:${studio.server.address().port}`, pid: process.pid, candidate: candidate.candidate_sha256 };
    await writeFile('.runtime/clap-preflight/browser.json', JSON.stringify(manifest));
    console.log(JSON.stringify(manifest));
    await new Promise(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); });
  }
} finally {
  await studio?.close();
  await rm(root, { recursive: true, force: true });
  await rm(finalRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ cleanup: 'owned roots and server removed', root, finalRoot }));
}
