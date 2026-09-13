// Isolated Studio review workspace: synthetic generation, real YouTube acquisition and normal editing/export.
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createStudio } from '../studio.mjs';
import { wavFixture } from '../wav-fixture.mjs';
const root = process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? await mkdtemp(resolve('.runtime/studio-youtube-'));
if (!root.startsWith(resolve('.runtime/studio-youtube-'))) throw new Error('Owned review root required');
const fixture = process.argv.includes('--offline');
const options = { root, port: Number(process.env.STUDIO_YOUTUBE_PORT ?? 8767), computePort: 0, token: 'youtube-review-fixture', fixture: true,
  preparePrompts: async intent => ({ version: 'prompt-plan-v2', intent, status: 'completed', error: null, model: 'synthetic-fixture', instructions_sha256: 'a'.repeat(64), generation_prompts: Array.from({ length: 5 }, (_, i) => `${intent} variation ${i + 1}`) }),
  backend: { start: async () => {}, stop: async () => {}, reset: async () => {}, unload: async () => {}, generate: async r => wavFixture(t => t > 0.1 && t < 4.8, r.duration_seconds) },
  ...(fixture ? { acquireYoutube: async (input, dir, { signal, stage }) => { await stage('Downloading audio window'); await new Promise((resolve, reject) => { const timer = setTimeout(resolve, 8000); signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true }); }); const file = dir + '/audio.wav'; await writeFile(file, wavFixture(undefined, input.end_seconds - input.start_seconds)); return { file }; }, searchYoutube: async () => [{ id: 'CBDZg1Jb_T4', title: 'Rain recording', url: 'https://www.youtube.com/watch?v=CBDZg1Jb_T4' }], youtubeReadiness: async () => ({ ready: true, tools: [] }) } : {}) };
const studio = await createStudio(options);
let batch = studio.batches.list()[0];
if (!batch) batch = await studio.batches.submit('youtube-review', { name: fixture ? 'YouTube lifecycle checks (synthetic)' : 'YouTube import review', sounds: [{ key: 'rain', prompt: 'rain on window field recording', duration_seconds: 5 }, { key: 'gate', prompt: 'metal gate latch sound effect', duration_seconds: 5 }] });
const manifest = { root, pid: process.pid, url: `http://127.0.0.1:${studio.server.address().port}`, batch_id: batch.id, fixture };
await mkdir('.test-artifacts', { recursive: true });
await writeFile(`.test-artifacts/studio-youtube-${fixture ? 'offline' : 'live'}-session.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await studio.close(); process.exit(); });
