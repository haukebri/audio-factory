import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { denoise } from './denoise.mjs';
import { decodeLoopWav, renderTrim, quantizeLoop, mixNoiseReduction } from './loop-audio.mjs';
import { wavFixture } from './wav-fixture.mjs';
import { createFactory } from './dist/service.js';
import { createStudio } from './studio.mjs';

function noisyRecording() {
  const wav = wavFixture(() => false, 3);
  let seed = 123;
  for (let i = 0; i < 3 * 44100; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = (seed / 2 ** 32 - .5) * .12 + (i > 44100 && i < 88200 ? .2 * Math.sin(2 * Math.PI * 440 * i / 44100) : 0);
    for (let ch = 0; ch < 2; ch++) wav.writeInt16LE(Math.round(value * 32768), 44 + i * 4 + ch * 2);
  }
  return wav;
}

test('denoising reduces steady noise without changing time, tails, source or Off samples', async () => {
  const wav = noisyRecording(), original = Buffer.from(wav);
  const off = await denoise(wav), cleaned = await denoise(wav, 20);
  assert.deepEqual(wav, original);
  assert.deepEqual(off, decodeLoopWav(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength)));
  assert.equal(cleaned.samples.length, off.samples.length);
  const rms = (samples, start, end) => Math.sqrt(samples.slice(start * 88200, end * 88200).reduce((sum, x) => sum + x * x, 0) / ((end - start) * 88200));
  assert.ok(rms(cleaned.samples, .5, .9) < rms(off.samples, .5, .9) * .2);
  assert.ok(rms(cleaned.samples, 1.2, 1.8) > rms(off.samples, 1.2, 1.8) * .85);
  const impulses = wavFixture(() => false, 1);
  for (const frame of [10, 22050, 44090]) impulses.writeInt16LE(20000, 44 + frame * 4);
  const aligned = await denoise(impulses, 12);
  for (const frame of [10, 22050, 44090]) {
    let peak = 0, at = 0;
    for (let i = Math.max(0, frame - 5); i <= Math.min(44099, frame + 5); i++)
      if (Math.abs(aligned.samples[i * 2]) > peak) { peak = Math.abs(aligned.samples[i * 2]); at = i; }
    assert.equal(at, frame, 'denoising preserves transient position, including the tail');
    assert.ok(peak > .1);
  }
  for (const value of [-1, 25, NaN, Infinity, '12', null]) await assert.rejects(denoise(wav, value), /0 to 24/);
  await assert.rejects(denoise(wav, 12, { signal: AbortSignal.abort() }));
});

test('preview and saved cuts use identical denoised PCM and preserve immutable originals', async () => {
  const root = await mkdtemp(resolve('.runtime/denoise-parity-')), wav = noisyRecording();
  const factory = await createFactory({ root, token: 'noise-test', backend: {
    async generate() { return wav; }, async reset() {}, async unload() {},
  } });
  let studio;
  const headers = { Authorization: 'Bearer noise-test', 'Content-Type': 'application/json' };
  try {
    await new Promise(resolve => factory.server.listen(0, '127.0.0.1', resolve));
    const generated = await fetch(`http://127.0.0.1:${factory.server.address().port}/v1/sound-effects`, {
      method: 'POST', headers, body: JSON.stringify({ prompt: 'Synthetic noisy tone', duration_seconds: 3 }),
    });
    assert.equal(generated.status, 200);
    const source = Buffer.from(await generated.arrayBuffer()), id = generated.headers.get('x-run-id');
    const generation = JSON.parse(await readFile(`${root}/out/runs/${id}/run.json`, 'utf8'));
    studio = await createStudio({ root, token: 'noise-test', port: 0, fixture: true });
    const candidate = studio.jobs.store.saveCandidate({ attempt_id: id, fixture: true, evaluation: null,
      evidence: { generation, analyses: [], cut_failure: null, reason: 'Noise fixture' } }, source);
    const base = `http://127.0.0.1:${studio.server.address().port}/studio/candidates/${candidate.candidate_sha256}`;
    const post = (path, body, auth = headers) => fetch(base + path, { method: 'POST', headers: auth, body: JSON.stringify(body) });
    assert.equal((await post('/denoise-preview', { noise_reduction_db: 12 }, { 'Content-Type': 'application/json' })).status, 401);
    for (const body of [{ noise_reduction_db: -1 }, { noise_reduction_db: null }, { noise_reduction_db: 25 }, { noise_reduction_db: 12, extra: true }])
      assert.equal((await post('/denoise-preview', body)).status, 400);
    const response = await post('/denoise-preview', { noise_reduction_db: 24 });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-audio-sample-rate'), '44100');
    assert.equal(response.headers.get('x-audio-channels'), '2');
    const raw = Buffer.from(await response.arrayBuffer()), samples = new Float32Array(raw.length / 4);
    for (let i = 0; i < samples.length; i++) samples[i] = raw.readFloatLE(i * 4);
    assert.equal(studio.jobs.store.listCandidates().length, 1, 'preview creates no saved take');
    const request = { start_seconds: .25, end_seconds: 2.75, noise_reduction_db: 12, loop: false, gain_db: -3 };
    const original = await denoise(source);
    const mixed = mixNoiseReduction(original.samples, samples, request.noise_reduction_db);
    const expected = quantizeLoop(renderTrim(mixed, 44100, 2, request).samples);
    assert.equal(mixNoiseReduction(original.samples, samples, 0), original.samples);
    assert.equal(mixNoiseReduction(original.samples, samples, 24), samples);
    const savedResponse = await post('/cut', request);
    assert.equal(savedResponse.status, 200, savedResponse.ok ? undefined : await savedResponse.text());
    const saved = await savedResponse.json(), audio = studio.jobs.store.readAsset(saved.candidate_sha256, 'audio');
    const decoded = decodeLoopWav(audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength));
    assert.equal(decoded.samples.length, expected.length);
    assert.ok(expected.every((value, i) => value === decoded.samples[i]), "preview and export PCM samples match");
    assert.deepEqual(studio.jobs.store.readAsset(saved.candidate_sha256, 'source'), source);
    assert.equal(saved.evidence.cut.noise_reduction.reduction_db, 12);
    assert.equal(saved.evidence.cut.bounds.processing_version, 'cosine-fades-v1');
    const effects = { pitch_semitones: 7, speed: .75, reverse: true, low_cut_hz: 120, high_cut_hz: 8000, start_seconds: .25, end_seconds: 2.75 };
    for (const bad of [{speed: 0}, {reverse: 'true'}, {low_cut_hz: 1000, high_cut_hz: 1000}, {extra: true}, {start_seconds: '0'}, {end_seconds: null}, [], true]) assert.equal((await post('/edit-preview', bad)).status, 400);
    const editedResponse = await post('/edit-preview', effects);
    assert.equal(editedResponse.status, 200, editedResponse.ok ? undefined : await editedResponse.text());
    const editedRaw = Buffer.from(await editedResponse.arrayBuffer()), count = editedRaw.length / 8;
    const dry = new Float32Array(count), wet = new Float32Array(count);
    for (let i = 0; i < count; i++) { dry[i] = editedRaw.readFloatLE(i * 4); wet[i] = editedRaw.readFloatLE((count + i) * 4); }
    assert.equal(count / 2, Math.round(2.5 / .75 * 44100));
    const editedRequest = { ...effects, noise_reduction_db: 12, gain_db: -3, loop: false };
    const previewEdited = quantizeLoop(renderTrim(mixNoiseReduction(dry, wet, 12), 44100, 2, { ...editedRequest, start_seconds: 0, end_seconds: count / 2 / 44100 }).samples);
    const editedSave = await post('/cut', editedRequest);
    assert.equal(editedSave.status, 200, editedSave.ok ? undefined : await editedSave.text());
    const editedCandidate = await editedSave.json(), editedWav = studio.jobs.store.readAsset(editedCandidate.candidate_sha256, 'audio');
    const actualEdited = decodeLoopWav(editedWav.buffer.slice(editedWav.byteOffset, editedWav.byteOffset + editedWav.byteLength));
    assert.equal(actualEdited.samples.length, previewEdited.length);
    assert.ok(previewEdited.every((value, i) => value === actualEdited.samples[i]), 'combined edit preview equals saved PCM');
    assert.equal(editedCandidate.evidence.cut.bounds.start_sample, 11025);
    assert.equal(editedCandidate.evidence.cut.edit.speed, .75);
    assert.deepEqual(studio.jobs.store.readAsset(editedCandidate.candidate_sha256, 'source'), source);
    const loopSave = await post('/cut', { ...editedRequest, loop: true, crossfade_seconds: .2 });
    assert.equal(loopSave.status, 200, loopSave.ok ? undefined : await loopSave.text());
    const loopCandidate = await loopSave.json();
    assert.equal(loopCandidate.evidence.cut.loop.start_sample, 0);
    assert.equal(loopCandidate.evidence.cut.bounds.start_sample, 11025);
    assert.equal(loopCandidate.evidence.cut.loop.output_frames, count / 2 - 8820);


  } finally { await studio?.close(); await factory.close(); await rm(root, { recursive: true, force: true }); }
});
