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
