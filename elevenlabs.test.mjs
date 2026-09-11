import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import test from 'node:test';
import { ElevenLabsBackend, elevenModel } from './dist/elevenlabs.js';
import { inspectWav } from './dist/wav.js';
import { createStudio } from './studio.mjs';

test('ElevenLabs preserves prompts, returns compatible audio and never repeats uncertain paid requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'elevenlabs-'));
  try {
    const mp3 = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-f', 'mp3', 'pipe:1']);
    let calls = 0;
    const request = { prompt: 'cat hissing\nConstraints: no music', duration_seconds: 1, seed: 42 };
    const context = { id: 'a'.repeat(32) };
    const options = { root, key: () => 'test-secret', fetch: async (url, input) => {
      calls++;
      assert.equal(new URL(url).searchParams.get('output_format'), 'mp3_44100_128');
      assert.equal(input.headers['xi-api-key'], 'test-secret');
      assert.deepEqual(JSON.parse(input.body), { text: request.prompt, duration_seconds: 1, model_id: elevenModel, prompt_influence: 0.3, loop: false });
      return new Response(mp3, { headers: { 'content-type': 'audio/mpeg', 'request-id': 'provider-id', 'character-cost': '40' } });
    } };
    const backend = new ElevenLabsBackend(options);
    await backend.start();
    await assert.rejects(backend.generate({ ...request, duration_seconds: 60 }, () => {}, context), /maximum of 30/);
    assert.equal(calls, 0);
    const result = await backend.generate(request, () => {}, context);
    assert.equal(inspectWav(result).seconds, 1);
    assert.deepEqual(await new ElevenLabsBackend(options).generate(request, () => {}, context), result);
    assert.equal(calls, 1);
    const receipt = await readFile(join(root, '.runtime/elevenlabs', context.id, 'response.json'), 'utf8');
    assert.equal(JSON.parse(receipt).request_id, 'provider-id');
    assert.ok(!receipt.includes('test-secret'));
    await assert.rejects(backend.generate({ ...request, prompt: 'different' }, () => {}, context), /conflict/);
    let failures = 0;
    const uncertain = new ElevenLabsBackend({ root, key: () => 'test-secret', fetch: async () => { failures++; throw new Error('connection lost'); } });
    const second = { id: 'b'.repeat(32) };
    await assert.rejects(uncertain.generate(request, () => {}, second), /connection lost/);
    await uncertain.reset();
    await assert.rejects(uncertain.generate(request, () => {}, second), /already submitted/);
    assert.equal(failures, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('studio delivers an normalized ElevenLabs take, exports provenance and reattaches without generation', async () => {
  const root = await mkdtemp(resolve('.runtime/elevenlabs-studio-'));
  let studio;
  try {
    const mp3 = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-f', 'mp3', 'pipe:1']);
    let calls = 0;
    const backend = new ElevenLabsBackend({ root, key: () => 'test-secret', fetch: async () => { calls++; return new Response(mp3); } });
    studio = await createStudio({ root, token: 'test-token', port: 0, computePort: 0, backend });
    const input = { provider: 'elevenlabs', request: { prompt: 'cat hissing', duration_seconds: 1 } };
    const job = await studio.jobs.submit('direct-elevenlabs', input);
    await studio.jobs.wait();
    assert.equal(job.status, 'completed', job.error);
    assert.equal(job.prompt_plan, undefined);
    assert.equal(job.attempts.length, 1);
    const candidate = studio.jobs.store.loadCandidate(job.result.candidate_sha256);
    assert.equal(candidate.evidence.analyses.length, 1);
    assert.ok(candidate.evidence.cut);
    assert.ok(Math.abs(inspectWav(studio.jobs.store.readAsset(candidate.candidate_sha256, 'audio')).peak - 10 ** (-3 / 20)) < .0001);
    assert.equal(candidate.evidence.generation.runtime.backend, 'elevenlabs');
    assert.equal(candidate.evidence.generation.audio.seconds, 1);
    const url = `http://127.0.0.1:${studio.server.address().port}/studio/candidates/${candidate.candidate_sha256}`;
    const response = await fetch(`${url}/export`, { headers: { Authorization: 'Bearer test-token' } });
    assert.equal(response.status, 200);
    const archive = Buffer.from(await response.arrayBuffer());
    assert.match(execFileSync('tar', ['-tf', '-'], { input: archive, encoding: 'utf8' }), /candidate.json/);
    const retained = JSON.parse(execFileSync(process.execPath, ['retain.mjs', job.result.audio], { encoding: 'utf8' }));
    try {
      assert.deepEqual(await readFile(retained.audio), studio.jobs.store.readAsset(candidate.candidate_sha256, 'audio'));
      assert.equal(retained.candidate_sha256, candidate.candidate_sha256);
    } finally { await rm(join(retained.audio, '..'), { recursive: true, force: true }); }
    await studio.close();
    studio = await createStudio({ root, token: 'test-token', port: 0, computePort: 0, backend });
    const reattached = await studio.jobs.submit('direct-elevenlabs', input);
    assert.deepEqual(await readFile(reattached.result.audio), studio.jobs.store.readAsset(candidate.candidate_sha256, 'audio'));
    assert.equal(calls, 1);
  } finally { await studio?.close(); await rm(root, { recursive: true, force: true }); }
});

test('native loop requests preserve decoded duration and receipts without paid retries', async () => {
  const root = await mkdtemp(resolve('.runtime/eleven-loop-'));
  let studio, calls = 0;
  try {
    const path = join(root, 'fixture.mp3');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path]);
    const mp3 = await readFile(path);
    const decoded = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-ar', '44100', '-ac', '2', '-f', 'f32le', '-']);
    const backend = new ElevenLabsBackend({ root, key: () => 'fixture', fetch: async (_, options) => {
      calls++;
      assert.equal(JSON.parse(options.body).loop, true);
      return new Response(mp3);
    } });
    const options = { root, token: 'test', port: 0, computePort: 0, fixture: true, backend, setup: async () => {} };
    studio = await createStudio(options);
    const input = { provider: 'elevenlabs', request: { prompt: 'Looped fixture', duration_seconds: 2, loop: true } };
    const job = await studio.jobs.submit('native', input);
    await studio.jobs.wait();
    assert.equal(job.status, 'completed', job.error);
    const candidate = studio.jobs.store.loadCandidate(job.result.candidate_sha256);
    const generation = candidate.evidence.generation;
    assert.equal(generation.request.loop, true);
    assert.equal(generation.settings.loop, true);
    assert.equal(generation.audio.seconds, decoded.length / 8 / 44100);
    assert.equal(candidate.evidence.cut.loop.processing_version, 'native-gain-v1');
    assert.equal(candidate.evidence.cut.loop.output_frames, decoded.length / 8);
    const audio = studio.jobs.store.readAsset(candidate.candidate_sha256, 'audio');
    assert.equal(inspectWav(audio).seconds, generation.audio.seconds);
    const trim = await studio.jobs.cut(candidate.candidate_sha256, { start_seconds: 0, end_seconds: 0.7, loop: false });
    const edited = await studio.jobs.cut(trim.candidate_sha256, { start_seconds: 0, end_seconds: 0.6 });
    assert.equal(edited.evidence.cut.request.loop, false);
    assert.equal(edited.evidence.cut.loop, undefined);
    await assert.rejects(studio.jobs.submit('native', { ...input, request: { ...input.request, loop: false } }), /conflict/);
    await studio.close(); studio = await createStudio(options);
    assert.equal((await studio.jobs.submit('native', input)).id, job.id);
    assert.equal(calls, 1);
    assert.deepEqual(studio.jobs.store.readAsset(candidate.candidate_sha256, 'audio'), audio);
  } finally { await studio?.close(); await rm(root, { recursive: true, force: true }); }
});
