// Owned, isolated synthetic browser workspace; no model downloads or user-library writes.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createStudio } from '../studio.mjs';
import { runWorkflow } from '../workflow.mjs';
import { wavFixture } from '../wav-fixture.mjs';
const root = process.argv[2] ?? await mkdtemp(resolve('.runtime/studio-ui-'));
if (!root.startsWith(resolve('.runtime/studio-ui-'))) throw new Error('Owned fixture root required');
const backend = { async start() {}, async stop() {}, async reset() {}, async unload() {}, async generate(request) { await new Promise(r => setTimeout(r, 3000)); const one = wavFixture(); const frames = Math.round(request.duration_seconds * 44100); const bytes = Buffer.alloc(44 + frames * 4); one.copy(bytes, 0, 0, 44); for (let i = 0; i < frames * 4; i++) bytes[44 + i] = one[44 + i % (one.length - 44)]; bytes.writeUInt32LE(bytes.length - 8, 4); bytes.writeUInt32LE(frames * 4, 40); return bytes; } };
const studio = await createStudio({ root, token: 'isolated-ui-fixture', port: Number(process.argv[3] ?? 0), computePort: 0, fixture: true, backend, setup: async () => {}, execute: async (job, options) => {
  job.input.qa = { clap: false };
  return runWorkflow(job, { ...options, evaluate: async () => null });
} });
if (!studio.jobs.list().length) {
  const input = { request: { prompt: 'Synthetic studio review tone', duration_seconds: 3 }, qa: { clap: false }, mode: 'manual', budget: { attempts: 1, minutes: 20 } };
  const first = await studio.jobs.submit('ui-fixture-first', input); await studio.jobs.wait();
  await studio.jobs.submit('ui-fixture-second', { ...input, sound_parent_id: first.id }); await studio.jobs.wait();
}
const manifest = { root, pid: process.pid, url: `http://127.0.0.1:${studio.server.address().port}` };
await writeFile('.test-artifacts/studio-ui-session.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await studio.close(); console.log('Closed owned studio; fixture audio preserved at ' + root); process.exit(); });
