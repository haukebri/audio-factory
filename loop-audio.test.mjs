import assert from 'node:assert/strict';
import test from 'node:test';
import { renderLoop, renderTrim, applyLevel } from './loop-audio.mjs';

test('rotation preserves adjacent wrap frames, exact overlap endpoints, stereo and peak ceiling', () => {
  const rate = 1000, frames = 4000;
  let seed = 17;
  const noise = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32 - 0.5);
  for (const signal of [noise, i => Math.sin(i * 0.13) * 0.4, i => i % 173 === 0 ? 0.6 : 0.01, () => 0]) {
    const source = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) { source[i * 2] = signal(i); source[i * 2 + 1] = source[i * 2] * -0.5; }
    const original = source.slice();
    for (const curve of ['equal-power', 'equal-gain']) {
      const { samples, evidence: e } = renderLoop(source, rate, 2, { start_seconds: 0, end_seconds: 4, crossfade_seconds: 0.5, curve });
      const gain = 10 ** (e.gain_db / 20);
      const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
      assert.equal(e.output_frames, 3500);
      assert.equal(samples.length, 7000);
      for (let ch = 0; ch < 2; ch++) {
        close(samples[ch], source[2000 * 2 + ch] * gain);
        close(samples[samples.length - 2 + ch], source[1999 * 2 + ch] * gain);
        close(samples[1500 * 2 + ch], source[3500 * 2 + ch] * gain);
        close(samples[1999 * 2 + ch], source[499 * 2 + ch] * gain);
        const t = 250 / 499;
        close(samples[1750 * 2 + ch], (source[3750 * 2 + ch] * (curve === 'equal-power' ? Math.cos(t * Math.PI / 2) : 1 - t) +
          source[250 * 2 + ch] * (curve === 'equal-power' ? Math.sin(t * Math.PI / 2) : t)) * gain);
      }
      for (let i = 0; i < samples.length; i += 2) {
        assert.ok(Number.isFinite(samples[i]) && Math.abs(samples[i]) <= 10 ** (-3 / 20) + 1e-7);
        close(samples[i + 1], samples[i] * -0.5);
      }
    }
    assert.deepEqual(source, original);
  }
});

test('automatic bounds remove sustained ramps, retain interior quiet, and leave constant ambience intact', () => {
  const source = new Float32Array(10000).fill(0.2);
  const constant = renderLoop(source, 1000, 1).evidence;
  assert.equal(constant.start_sample, 0);
  assert.equal(constant.end_sample, 10000);
  for (let i = 0; i < 1000; i++) source[i] *= i / 1000;
  for (let i = 9000; i < 10000; i++) source[i] *= (9999 - i) / 1000;
  source.fill(0, 4000, 4500);
  const { samples, evidence: e } = renderLoop(source, 1000, 1);
  assert.ok(e.start_sample >= 750 && e.start_sample <= 850);
  assert.ok(e.end_sample >= 9150 && e.end_sample <= 9250);
  assert.equal(samples.length, e.end_sample - e.start_sample - 500);
  assert.ok(samples.slice(-1000).includes(0), 'interior quiet remains in the rotated source');
  assert.throws(() => renderLoop(new Float32Array(1000), 1000, 1), /manual bounds/);
  assert.throws(() => renderLoop(new Float32Array(100).fill(0.2), 1000, 1), /too short/);
  assert.throws(() => renderLoop(Float32Array.of(NaN), 1000, 1), /finite/);
  assert.throws(() => renderLoop(source, 1000, 1, { start_seconds: 1 }), /Start\/End/);
  assert.throws(() => renderLoop(source, 1000, 1, { crossfade_seconds: 0 }), /crossfade/);
  const capped = renderLoop(new Float32Array(400).fill(0.2), 1000, 1, { crossfade_seconds: 2 });
  assert.equal(capped.evidence.overlap_frames, 100);
});

test('native loops preserve timing after boundary assessment, while explicit repair rotates the source', () => {
  const source = Float32Array.from({ length: 4000 }, (_, i) => Math.sin(2 * Math.PI * i / 100) * 0.3);
  const native = renderLoop(source, 1000, 1, { native_provider_loop: true });
  assert.equal(native.evidence.processing_version, 'native-gain-v1');
  assert.equal(native.evidence.output_frames, source.length);
  assert.equal(native.evidence.overlap_frames, 0);
  assert.equal(native.evidence.split_sample, null);
  assert.equal(native.evidence.native_assessment.usable, true);
  const gain = 10 ** (native.evidence.gain_db / 20);
  for (let i = 0; i < source.length; i++) assert.ok(Math.abs(native.samples[i] - source[i] * gain) < 1e-7);
  const repaired = renderLoop(source, 1000, 1, { native_provider_loop: true, crossfade_seconds: 0.5 });
  assert.equal(repaired.evidence.processing_version, 'rotate-crossfade-v1');
  assert.equal(repaired.evidence.output_frames, 3500);
  const padded = source.slice(); padded.fill(0, 0, 200); padded.fill(0, 3800);
  const assessed = renderLoop(padded, 1000, 1, { native_provider_loop: true });
  assert.equal(assessed.evidence.native_assessment.usable, false);
  assert.equal(assessed.evidence.processing_version, 'rotate-crossfade-v1');
});


test('trim levels normalize the selection, preserve stereo and limit peaks with lookahead', () => {
  const source = new Float32Array(2000);
  for (let i = 0; i < 1000; i++) { source[2 * i] = i < 500 ? 0.1 : 0.8; source[2 * i + 1] = -source[2 * i] / 2; }
  const options = { start_seconds: 0, end_seconds: 0.4 };
  const base = renderTrim(source, 1000, 2, options);
  assert.ok(Math.abs(base.samples[200] - 10 ** (-3 / 20)) < 1e-6, 'normalize selected quiet region, not the loud event outside it');
  for (const gain_db of [-12, 0, 12]) {
    const cut = renderTrim(source, 1000, 2, { ...options, gain_db });
    assert.equal(cut.samples.length, 800);
    assert.equal(cut.samples[0], 0);
    for (let i = 0; i < cut.samples.length; i += 2) {
      assert.ok(Math.abs(cut.samples[i]) <= 10 ** (-0.1 / 20) + 1e-7);
      assert.ok(Math.abs(cut.samples[i + 1] + cut.samples[i] / 2) < 10 ** ((base.evidence.gain_db + gain_db) / 20) / 32768, "stereo balance within faded PCM16 rounding");
      if (gain_db <= 0) assert.ok(Math.abs(cut.samples[i] - base.samples[i] * 10 ** (gain_db / 20)) < 1e-7);
    }
    assert.equal(cut.level.limiter_reduction_db > 0, gain_db > 0);
  }
  const faded = renderTrim(new Float32Array(35280).fill(0.25), 44100, 2, { normalize: false, fade_ms: 5 }).samples;
  assert.equal(faded[200], Math.trunc(8192 * 100 / 221) / 32768, 'FFmpeg rounds 5 ms to 221 frames and truncates PCM16 fades');
  assert.equal(faded.at(-1), Math.trunc(8192 * 2 / 221) / 32768);
  const transient = new Float32Array(1000).fill(0.2); transient[100] = 1;
  const limited = applyLevel(transient, 1000, 1, 12).samples;
  assert.ok(limited[94] > 0.7 && limited[95] < 0.21, '5 ms lookahead anticipates the transient');
  assert.ok(limited[102] < limited[150] && limited[150] < limited[300], 'gain recovers gradually');
  const rotated = Float32Array.from({length:1000}, (_, i) => transient[(i + 97) % 1000]);
  const cyclic = applyLevel(transient, 1000, 1, 12, true).samples;
  const cyclicRotated = applyLevel(rotated, 1000, 1, 12, true).samples;
  for (let i = 0; i < 1000; i++) assert.ok(Math.abs(cyclicRotated[i] - cyclic[(i + 97) % 1000]) < 1e-7, 'loop envelope is independent of the seam');
  assert.deepEqual(renderTrim(new Float32Array(2), 44100, 2, { gain_db: 12 }).samples, new Float32Array(2));
  const raw = renderTrim(source, 1000, 2, { ...options, normalize: false, gain_db: -6 });
  assert.ok(Math.abs(raw.samples[200] - 0.1 * 10 ** (-6 / 20)) < 1 / 32768);
  for (const gain_db of [NaN, Infinity, -13, 13, '3']) assert.throws(() => renderTrim(source, 1000, 2, {gain_db}), /level/);
});

test('zero-level manual cuts retain the previous FFmpeg fades and normalized PCM', async () => {
  const { execFileSync } = await import('node:child_process');
  const { wavFixture } = await import('./wav-fixture.mjs');
  const { decodeLoopWav, quantizeLoop } = await import('./loop-audio.mjs');
  const wav = wavFixture(() => true, 1);
  const source = decodeLoopWav(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
  for (const [start_seconds, end_seconds] of [[0, 0.4], [0.21, 0.39], [1234 / 44100, 10003 / 44100]]) {
    const start = Math.round(start_seconds * 44100), end = Math.round(end_seconds * 44100), seconds = (end - start) / 44100;
    const filters = `atrim=start_sample=${start}:end_sample=${end},asetpts=PTS-STARTPTS,afade=t=in:d=0.005,afade=t=out:st=${seconds - 0.005}:d=0.005`;
    const ffmpeg = (filter, format) => execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-af', filter, '-f', format, '-'], { input: wav });
    const faded = ffmpeg(filters, 'f32le');
    let peak = 0;
    for (let i = 0; i < faded.length; i += 4) peak = Math.max(peak, Math.abs(faded.readFloatLE(i)));
    const previous = ffmpeg(`${filters},volume=${-3 - 20 * Math.log10(peak)}dB`, 's16le');
    const current = quantizeLoop(renderTrim(source.samples, 44100, 2, { start_seconds, end_seconds, fade_ms: 5 }).samples);
    assert.equal(current.length * 2, previous.length);
    for (let i = 0; i < current.length; i++) assert.ok(Math.abs(current[i] * 32768 - previous.readInt16LE(i * 2)) <= 1, JSON.stringify({ start_seconds, end_seconds, frame: i / 2, current: current[i] * 32768, previous: previous.readInt16LE(i * 2) }));
  }
});


test('automatic cosine fades preserve attacks and soften tails, including tiny clips', () => {
  const source = new Float32Array(1000).fill(.5), original = source.slice();
  const result = renderTrim(source, 1000, 1, { normalize: false });
  assert.equal(result.samples[0], 0); assert.equal(result.samples[999], 0);
  assert.equal(result.samples[10], .5); assert.equal(result.samples[899], .5);
  assert.ok(Math.abs(result.samples[5] - .25) < 1e-7);
  assert.ok(Math.abs(result.samples[949] - .25) < 1e-7);
  assert.equal(result.evidence.fade_in_seconds, .01); assert.equal(result.evidence.fade_out_seconds, .1);
  assert.deepEqual(source, original);
  for (const frames of [1, 2, 3, 20, 100]) {
    const clip = renderTrim(source.slice(0, frames), 1000, 1, { normalize: false });
    assert.equal(clip.samples.length, frames);
    assert.equal(clip.samples[0], 0); assert.equal(clip.samples.at(-1), 0);
    assert.ok(clip.evidence.fade_in_seconds + clip.evidence.fade_out_seconds <= frames / 2000);
    if (frames > 2) assert.ok(clip.samples.includes(.5));
  }
  for (const value of [-1, NaN, Infinity, '10']) assert.throws(() => renderTrim(source, 1000, 1, { fade_in_ms: value }), /fade/);
  assert.deepEqual(renderLoop(source, 1000, 1).samples, renderLoop(source, 1000, 1, { fade_in_ms: 10, fade_out_ms: 100 }).samples);
});
