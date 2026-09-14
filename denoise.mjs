import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { decodeLoopWav, mixNoiseReduction } from './loop-audio.mjs';

const execute = promisify(execFile);

export function noiseReduction(value = 0) {
  if (!Number.isFinite(value) || value < 0 || value > 24)
    throw Object.assign(new Error('Choose noise reduction from 0 to 24 dB.'), { status: 400 });
  return value;
}

// Both saved cuts and previews start from the same preserved PCM16 source.
export async function denoise(wav, strength = 0, { signal, timeout = 120000 } = {}) {
  noiseReduction(strength);
  signal?.throwIfAborted();
  const source = decodeLoopWav(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
  if (!strength) return source;
  const frames = source.samples.length / source.channels;
  const hop = Math.floor(source.sampleRate / 80), profileFrames = Math.min(frames, 32 * hop);
  const windows = [];
  for (let start = 0; start + profileFrames <= frames; start += profileFrames) {
    let energy = 0;
    for (let i = start * source.channels; i < (start + profileFrames) * source.channels; i++) energy += source.samples[i] ** 2;
    const db = 10 * Math.log10(energy / (profileFrames * source.channels));
    if (db > -80) windows.push({ start, db });
  }
  windows.sort((a, b) => a.db - b.db);
  // ponytail: quiet tenth-percentile window estimates background; add manual profiling for ambiguous continuous sounds.
  const profile = windows[Math.floor(windows.length * .1)] ?? { start: 0, db: -80 };
  const floor = Math.max(-80, Math.min(-20, profile.db));
  const input = Buffer.alloc((profileFrames * source.channels + source.samples.length) * 4);
  for (let i = 0; i < profileFrames * source.channels; i++) input.writeFloatLE(source.samples[profile.start * source.channels + i], i * 4);
  for (let i = 0; i < source.samples.length; i++) input.writeFloatLE(source.samples[i], (profileFrames * source.channels + i) * 4);
  // afftdn delays by two analysis hops. Flush its tail before removing that delay.
  const delay = 2 * hop, offset = profileFrames + delay;
  const filter = `apad=pad_len=${delay},asetnsamples=n=${hop}:p=0,asendcmd=c='0 afftdn sn start;${profileFrames / source.sampleRate} afftdn sn stop',afftdn=nr=24:nf=${floor}:tn=0:gs=3,atrim=start_sample=${offset}:end_sample=${offset + frames},asetpts=PTS-STARTPTS`;
  const pending = execute('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'f32le', '-ar', String(source.sampleRate), '-ac', String(source.channels), '-i', 'pipe:0',
    '-af', filter, '-f', 'f32le', 'pipe:1'], {
    encoding: 'buffer', signal, timeout, maxBuffer: 32 * 1024 * 1024, killSignal: 'SIGKILL',
  });
  pending.child.stdin.on('error', () => {}); // A failed/aborted FFmpeg is reported by pending.
  pending.child.stdin.end(input);
  const { stdout } = await pending;
  if (stdout.length !== source.samples.length * 4) throw new Error('Noise reduction changed the source frame count.');
  const cleaned = new Float32Array(source.samples.length);
  for (let i = 0; i < cleaned.length; i++) {
    const value = stdout.readFloatLE(i * 4);
    if (!Number.isFinite(value)) throw new Error('Noise reduction produced invalid audio.');
    cleaned[i] = value;
  }
  return { ...source, samples: mixNoiseReduction(source.samples, cleaned, strength), evidence: {
    processing_version: 'profiled-afftdn-v2', reduction_db: strength, max_reduction_db: 24,
    noise_floor_db: floor, track_noise: false, gain_smooth: 3, delay_frames: delay,
    profile_start_sample: profile.start, profile_end_sample: profile.start + profileFrames } };
}

// Prepare matched dry/clean stems once; strength remains a local mix in the editor.
export async function prepareEdit(wav, request, options = {}) {
  const { transformAudio, editSettings } = await import('./edit-audio.mjs');
  const settings = editSettings(request);
  for (const key of ['start_seconds', 'end_seconds']) if (request[key] !== undefined && (!Number.isFinite(request[key]) || request[key] < 0 || request[key] > 60))
    throw Object.assign(new Error('Choose source timestamps from 0 to 60 seconds.'), { status: 400 });
  const deadline = Date.now() + (options.timeout ?? 120000);
  const remaining = () => ({ ...options, timeout: Math.max(1, deadline - Date.now()) });
  const original = await denoise(wav, 0, remaining());
  const start = Math.round((request.start_seconds ?? 0) * original.sampleRate);
  const end = Math.round((request.end_seconds ?? original.samples.length / original.channels / original.sampleRate) * original.sampleRate);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > original.samples.length / original.channels)
    throw Object.assign(new Error('Choose valid source bounds.'), { status: 400 });
  const cleaned = await denoise(wav, 24, remaining());
  const crop = source => ({ ...source, samples: source.samples.slice(start * source.channels, end * source.channels) });
  const dry = await transformAudio(crop(original), settings, remaining());
  const wet = await transformAudio(crop(cleaned), settings, remaining());
  return { ...dry, cleaned: wet.samples, noiseEvidence: cleaned.evidence,
    edit: { ...settings, processing_version: 'ffmpeg-edit-v1', output_frames: dry.samples.length / dry.channels },
    start, end };
}
