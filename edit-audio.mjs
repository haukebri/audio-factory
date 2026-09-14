import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };

export function editSettings(options = {}) {
  const { pitch_semitones = 0, speed = 1, reverse = false, low_cut_hz = 0, high_cut_hz = 0 } = options;
  if (!Number.isFinite(pitch_semitones) || pitch_semitones < -12 || pitch_semitones > 12 ||
      !Number.isFinite(speed) || speed < .5 || speed > 2 || typeof reverse !== 'boolean' ||
      !Number.isFinite(low_cut_hz) || low_cut_hz !== 0 && (low_cut_hz < 20 || low_cut_hz > 1000) ||
      !Number.isFinite(high_cut_hz) || high_cut_hz !== 0 && (high_cut_hz < 1000 || high_cut_hz > 20000) ||
      low_cut_hz && high_cut_hz && low_cut_hz >= high_cut_hz)
    invalid('Choose pitch from −12 to +12, speed from 0.5 to 2, and low cut below high cut.');
  return { pitch_semitones, speed, reverse, low_cut_hz, high_cut_hz };
}
export function hasEdits(options) {
  const s = editSettings(options);
  return s.pitch_semitones !== 0 || s.speed !== 1 || s.reverse || s.low_cut_hz !== 0 || s.high_cut_hz !== 0;
}

export async function transformAudio(source, options = {}, { signal, timeout = 120000 } = {}) {
  const settings = editSettings(options), { sampleRate, channels, samples } = source;
  if (!(samples instanceof Float32Array) || !Number.isInteger(sampleRate) || sampleRate < 1 ||
      !Number.isInteger(channels) || channels < 1 || !samples.length || samples.length % channels || samples.some(value => !Number.isFinite(value)))
    invalid('Expected finite interleaved audio.');
  signal?.throwIfAborted();
  if (!hasEdits(settings)) return source;
  const frames = samples.length / channels;
  const reversed = settings.reverse ? new Float32Array(samples.length) : samples;
  if (settings.reverse) for (let frame = 0; frame < frames; frame++)
    for (let channel = 0; channel < channels; channel++) reversed[frame * channels + channel] = samples[(frames - frame - 1) * channels + channel];
  if (!settings.pitch_semitones && settings.speed === 1 && !settings.low_cut_hz && !settings.high_cut_hz) return { ...source, samples: reversed };
  const rate = Math.round(sampleRate * 2 ** (settings.pitch_semitones / 12));
  const filters = [];
  // Supply the stretch analysis window at the tail, then retain exact output duration.
  const stretching = settings.pitch_semitones !== 0 || settings.speed !== 1;
  if (stretching) filters.push(`apad=pad_dur=0.5`);
  if (rate !== sampleRate) filters.push(`asetrate=${rate}`, `aresample=${sampleRate}`);
  let tempo = settings.speed / (rate / sampleRate);
  while (tempo < .5) { filters.push('atempo=0.5'); tempo /= .5; }
  while (tempo > 2) { filters.push('atempo=2'); tempo /= 2; }
  if (Math.abs(tempo - 1) > 1e-10) filters.push(`atempo=${tempo}`);
  if (settings.low_cut_hz) filters.push(`highpass=f=${settings.low_cut_hz}:p=2`);
  if (settings.high_cut_hz) filters.push(`lowpass=f=${settings.high_cut_hz}:p=2`);
  const outputFrames = Math.max(1, Math.round(frames / settings.speed));
  filters.push(`apad=whole_len=${outputFrames}`, `atrim=end_sample=${outputFrames}`);
  const input = Buffer.alloc(reversed.length * 4);
  for (let i = 0; i < reversed.length; i++) input.writeFloatLE(reversed[i], i * 4);
  const pending = execute('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'f32le', '-ar', String(sampleRate), '-ac', String(channels), '-i', 'pipe:0',
    '-af', filters.join(','), '-f', 'f32le', 'pipe:1'], { encoding: 'buffer', signal, timeout, maxBuffer: 128 * 1024 * 1024, killSignal: 'SIGKILL' });
  pending.child.stdin.on('error', () => {});
  pending.child.stdin.end(input);
  const { stdout } = await pending;
  if (stdout.length !== outputFrames * channels * 4) throw new Error('Edited audio frame count mismatch.');
  const output = new Float32Array(outputFrames * channels);
  for (let i = 0; i < output.length; i++) {
    output[i] = stdout.readFloatLE(i * 4);
    if (!Number.isFinite(output[i])) throw new Error('Invalid edited audio sample.');
  }
  return { ...source, samples: output };
}
