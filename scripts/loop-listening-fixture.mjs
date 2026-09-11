// Derive audition-only files from preserved originals. Never touches a batch, winner or provider.
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { hash } from '../dist/config.js';
import { decodeLoopWav, renderLoop, quantizeLoop } from '../loop-audio.mjs';
const ids = process.argv.slice(2);
if (ids.length !== 3 || ids.some(id => !/^[a-f0-9]{64}$/.test(id))) throw new Error('Pass rain, forest and shoreline candidate hashes');
await mkdir('.test-artifacts', { recursive: true });
const directory = await mkdtemp(resolve('.test-artifacts/loop-listening-'));
const results = [];
for (const [index, id] of ids.entries()) {
  const name = ['rain', 'forest', 'shoreline'][index];
  const originalPath = resolve('.runtime/studio/candidates', id, 'source.wav');
  const candidate = JSON.parse(await readFile(resolve('.runtime/studio/candidates', id, 'candidate.json'), 'utf8'));
  const original = await readFile(originalPath);
  if (hash(original) !== candidate.evidence.generation.audio_sha256) throw new Error('Original hash mismatch');
  const source = decodeLoopWav(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength));
  const rendered = renderLoop(source.samples, source.sampleRate, source.channels);
  const samples = quantizeLoop(rendered.samples);
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) pcm.writeInt16LE(samples[i] * 32768, i * 2);
  for (const [suffix, data] of [['loop', pcm], ['three-cycles', Buffer.concat([pcm, pcm, pcm])]])
    execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-f', 's16le', '-ar', String(source.sampleRate), '-ac', String(source.channels), '-i', 'pipe:0', '-c:a', 'pcm_s16le', join(directory, `${name}-${suffix}.wav`)], { input: data });
  await writeFile(join(directory, `${name}-original.wav`), original, { flag: 'wx' });
  if (hash(await readFile(originalPath)) !== hash(original)) throw new Error('Original changed during audition preparation');
  results.push({ name, candidate: id, source_sha256: hash(original), loop_sha256: hash(await readFile(join(directory, `${name}-loop.wav`))),
    ...rendered.evidence, seconds: rendered.evidence.output_frames / source.sampleRate, listening: 'pending' });
}
await writeFile(join(directory, 'evidence.json'), JSON.stringify(results, null, 2));
await writeFile(join(directory, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Loop listening review</title><style>body{font:18px/1.5 sans-serif;max-width:850px;margin:40px auto;padding:20px}audio{width:100%}section{margin:40px 0}h1,h2{line-height:1.2}</style><h1>Loop listening review</h1><p>Audition-only copies. Each prepared track repeats three times without gaps. Listen for clicks, level dips, repeated bird calls, phase changes and unnatural wave timing. These files do not change any winner.</p>${results.map(r => `<section><h2>${r.name} · ${r.seconds.toFixed(2)} seconds per loop</h2><p>Prepared loop · three cycles</p><audio controls preload="metadata" src="${r.name}-three-cycles.wav"></audio><details><summary>Compare original</summary><audio controls preload="metadata" src="${r.name}-original.wav"></audio></details></section>`).join('')}`);
console.log(JSON.stringify({ directory, results }));
