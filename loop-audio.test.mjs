import assert from 'node:assert/strict';
import test from 'node:test';
import { renderLoop } from './loop-audio.mjs';

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
