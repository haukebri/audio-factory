// Five real local variations and one explicitly paid ElevenLabs recreation. Reruns reuse saved requests.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { root, hash } from './dist/config.js';
import { ensureSetup } from './dist/setup.js';
import { elevenKey } from './dist/elevenlabs.js';
import { openJobs } from './workflow.mjs';
import { inspectWav } from './dist/wav.js';
import { verifyExport } from './export-lineage.mjs';
elevenKey();
const models = await (await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(10000) })).json();
assert.ok(models.models.some(m => m.name === 'gemma4:latest'), 'gemma4:latest must be installed');
await ensureSetup(true);
const workspace = join(root, '.runtime/hybrid-smoke'); await mkdir(workspace, { recursive: true });
const jobs = await openJobs({ root: workspace, token: randomBytes(32).toString('hex'), computePort: 0 });
const stop = () => { void jobs.close(); }; process.once('SIGINT', stop); process.once('SIGTERM', stop);
const interval = setInterval(() => { const j = jobs.list().at(-1); console.log(JSON.stringify({ provider: j?.provider, status: j?.status, progress: j?.progress, variant: (j?.variant_index ?? 0) + 1, attempts: j?.attempts?.length })); }, 15000);
try {
  const local = await jobs.submit('hybrid-smoke-local-v1', { request: { prompt: 'A cat hissing', duration_seconds: 5 } }); await jobs.wait();
  assert.equal(local.status, 'completed', local.error); assert.equal(local.variants.length, 5);
  const source = local.variants.find(v => v.status === 'completed')?.result.candidate_sha256;
  assert.ok(source, 'No usable local take for recreation');
  const paid = await jobs.recreate(source, 'hybrid-smoke-elevenlabs-v1'); await jobs.wait();
  assert.equal(paid.status, 'completed', paid.error); assert.equal(paid.attempts.length, 1);
  assert.equal(paid.input.request.prompt, jobs.store.loadCandidate(source).evidence.generation.request.prompt);
  const results = [local, paid].flatMap(j => j.variants.map(v => {
    const c = jobs.store.loadCandidate(v.result.candidate_sha256), audio = jobs.store.readAsset(c.candidate_sha256, c.evidence.cut ? 'audio' : 'source');
    if (c.evidence.cut) { verifyExport(c.evidence, audio, () => jobs.store.readAsset(c.candidate_sha256, 'source')); assert.ok(Math.abs(inspectWav(audio).peak - 10 ** (-3 / 20)) < .0001); }
    return { provider: j.provider, prompt: v.prompt, outcome: v.result.outcome, audio: v.result.audio, sha256: hash(audio), signal: c.evidence.cut?.result, listening: 'unreviewed' };
  }));
  await writeFile(join(workspace, 'verification.json'), JSON.stringify({ local_job: local.id, paid_job: paid.id, results }, null, 2));
  console.log(JSON.stringify({ workspace, local_generations: local.attempts.length, paid_generations: paid.attempts.length, results: results.map(r => ({ provider: r.provider, audio: r.audio, outcome: r.outcome })) }));
} finally { clearInterval(interval); process.off('SIGINT', stop); process.off('SIGTERM', stop); await jobs.close(); }
