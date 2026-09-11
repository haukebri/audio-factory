// Owned, isolated synthetic browser workspace; no model downloads or user-library writes.
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createStudio } from '../studio.mjs';
import { wavFixture } from '../wav-fixture.mjs';
const root = process.argv[2] ?? await mkdtemp(resolve('.runtime/studio-ui-'));
if (!root.startsWith(resolve('.runtime/studio-ui-'))) throw new Error('Owned fixture root required');
// This injected backend handles every provider; the dummy key only enables the UI.
process.env.ELEVEN_KEY = 'isolated-fixture-not-a-real-key';
await mkdir('.test-artifacts', { recursive: true });
const backend = { async start() {}, async stop() {}, async reset() {}, async unload() {}, async generate(request) { await new Promise(r => setTimeout(r, 3000)); const one = wavFixture(); const frames = Math.round(request.duration_seconds * 44100); const bytes = Buffer.alloc(44 + frames * 4); one.copy(bytes, 0, 0, 44); for (let i = 0; i < frames * 4; i++) bytes[44 + i] = one[44 + i % (one.length - 44)]; bytes.writeUInt32LE(bytes.length - 8, 4); bytes.writeUInt32LE(frames * 4, 40); return bytes; } };
const studio = await createStudio({ root, token: 'isolated-ui-fixture', port: Number(process.argv[3] ?? 0), computePort: 0, fixture: true, backend, setup: async () => {}, preparePrompts: async intent => ({ version: 'prompt-plan-v2', intent, status: 'completed', error: null, model: 'synthetic-test', instructions_sha256: 'a'.repeat(64), generation_prompts: Array.from({length: 5}, (_, i) => `Synthetic tone variation ${i + 1}`) }) });
if (!studio.jobs.list().length) {
  const input = { request: { prompt: 'Synthetic studio review tone', duration_seconds: 3 } };
  const first = await studio.jobs.submit('ui-fixture-first', input); await studio.jobs.wait();

}
const manifest = { root, pid: process.pid, url: `http://127.0.0.1:${studio.server.address().port}` };
await writeFile('.test-artifacts/studio-ui-session.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await studio.close(); console.log('Closed owned studio; fixture audio preserved at ' + root); process.exit(); });
