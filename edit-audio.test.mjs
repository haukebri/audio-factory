import test from 'node:test';
import assert from 'node:assert/strict';
import { transformAudio, editSettings } from './edit-audio.mjs';
const rate = 44100;
const tone = (hz = 440, seconds = 1) => ({ sampleRate: rate, channels: 2, samples: Float32Array.from({ length: Math.round(rate * seconds) * 2 }, (_, i) => .2 * Math.sin(2 * Math.PI * hz * Math.floor(i / 2) / rate)) });
const frequency = source => { let crossings = 0; const start = Math.round(source.samples.length / 8) * 2, end = Math.floor(source.samples.length * 3 / 8) * 2; for (let i = start + 2; i < end; i += 2) if (source.samples[i - 2] < 0 && source.samples[i] >= 0) crossings++; return crossings / ((end - start) / 2 / rate); };
const rms = source => Math.sqrt(source.samples.slice(rate / 5 * 2).reduce((sum, value) => sum + value * value, 0) / (source.samples.length - rate / 5 * 2));
test('pitch and speed are independent; reverse preserves stereo and filters attenuate their bands', async () => {
  const source = tone(), before = source.samples.slice();
  assert.equal(await transformAudio(source), source);
  for (const settings of [{pitch_semitones:12}, {speed:.5}, {pitch_semitones:-12,speed:2}]) {
    const output = await transformAudio(source, settings);
    assert.equal(output.samples.length / 2, Math.round(rate / (settings.speed ?? 1)));
    assert.ok(Math.abs(frequency(output) - 440 * 2 ** ((settings.pitch_semitones ?? 0) / 12)) < 8, `frequency ${frequency(output)}`);
  }
  const stereo = { sampleRate: rate, channels: 2, samples: new Float32Array([.1,.2,.3,.4]) };
  assert.deepEqual((await transformAudio(stereo,{reverse:true})).samples, new Float32Array([.3,.4,.1,.2]));
  const bass = tone(50), treble = tone(10000);
  assert.ok(rms(await transformAudio(bass,{low_cut_hz:500})) < rms(bass) * .03);
  assert.ok(rms(await transformAudio(treble,{high_cut_hz:2000})) < rms(treble) * .05);
  for (const seconds of [.001,.01]) for (const settings of [{speed:.5,pitch_semitones:12}, {speed:2,pitch_semitones:-12}]) {
    const output = await transformAudio(tone(440,seconds), settings);
    assert.ok(output.samples.every(Number.isFinite));
    assert.equal(output.samples.length/2, Math.round(Math.round(rate*seconds)/settings.speed));
  }
  assert.deepEqual(source.samples, before);
  for (const bad of [{speed:0},{pitch_semitones:NaN},{reverse:1},{low_cut_hz:1000,high_cut_hz:1000}]) assert.throws(()=>editSettings(bad), {status:400});
});
