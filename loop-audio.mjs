// Shared by immutable exports and Web Audio previews. All positions are source frames.
export function renderLoop(samples, sampleRate, channels, options = {}) {
  if (!(samples instanceof Float32Array) || !Number.isInteger(sampleRate) || sampleRate < 1 ||
      !Number.isInteger(channels) || channels < 1 || !samples.length || samples.length % channels ||
      samples.some(value => !Number.isFinite(value))) throw new Error('Expected finite interleaved PCM audio');
  const frames = samples.length / channels;
  const { crossfade_seconds = 0.5, curve = 'equal-power', peak_db = -3, normalize = true } = options;
  if (!Number.isFinite(crossfade_seconds) || crossfade_seconds < 0.05 || crossfade_seconds > 2 ||
      !['equal-power', 'equal-gain'].includes(curve) || !Number.isFinite(peak_db) || peak_db < -30 || peak_db > -3 ||
      typeof normalize !== 'boolean') throw new Error('Choose a crossfade from 0.05 to 2 seconds and a peak from -30 to -3 dB');
  const explicit = options.start_seconds !== undefined || options.end_seconds !== undefined;
  let start = explicit ? Math.round(options.start_seconds * sampleRate) : 0;
  let end = explicit ? Math.round(options.end_seconds * sampleRate) : frames;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > frames || end <= start)
    throw new Error('Choose nonempty Start/End bounds within the original source');

  let native = null;
  if (options.native_provider_loop) {
    const edgeFrames = Math.min(Math.round(sampleRate * 0.05), Math.floor(frames / 4));
    let energy = 0, difference = 0, edgeStart = 0, edgeEnd = 0, boundary = 0;
    for (let i = 0; i < samples.length; i++) {
      energy += samples[i] ** 2;
      if (i >= channels) difference += (samples[i] - samples[i - channels]) ** 2;
      if (i < edgeFrames * channels) edgeStart += samples[i] ** 2;
      if (i >= (frames - edgeFrames) * channels) edgeEnd += samples[i] ** 2;
    }
    for (let c = 0; c < channels; c++) boundary = Math.max(boundary, Math.abs(samples[c] - samples[(frames - 1) * channels + c]));
    const rms = Math.sqrt(energy / samples.length);
    const edgeRatio = Math.sqrt(Math.min(edgeStart, edgeEnd) / Math.max(1, edgeFrames * channels)) / (rms || 1);
    const derivative = Math.sqrt(difference / Math.max(1, samples.length - channels));
    native = { boundary_step: boundary, adjacent_step_rms: derivative, edge_rms_ratio: edgeRatio,
      usable: rms >= 0.0001 && edgeRatio >= 0.2 && boundary <= Math.max(0.02, derivative * 8), advisory: true };
  }
  const preserveNative = native?.usable && !explicit && options.crossfade_seconds === undefined && options.curve === undefined;
  // ponytail: conservative energy-only edge detection; audition natural swells and use manual bounds when ambiguous.
  if (!explicit && !preserveNative) {
    const window = Math.max(1, Math.round(sampleRate * 0.05));
    const envelope = [];
    for (let frame = 0; frame < frames; frame += window) {
      let energy = 0;
      const limit = Math.min(frames, frame + window);
      for (let i = frame * channels; i < limit * channels; i++) energy += samples[i] ** 2;
      envelope.push(Math.sqrt(energy / ((limit - frame) * channels)));
    }
    const quarter = Math.floor(envelope.length / 4);
    const interior = envelope.slice(quarter, envelope.length - quarter).sort((a, b) => a - b);
    const reference = interior[Math.floor(interior.length / 2)];
    if (!reference || reference < 0.0001) throw new Error('No suitable continuous body found; choose manual bounds or another recording');
    const crop = values => {
      if (values.length < 4 || values[0] > reference * 0.35) return 0;
      const reached = values.findIndex(value => value >= reference * 0.8);
      if (reached < 3) return 0;
      let rising = 0;
      for (let i = 1; i <= reached; i++) if (values[i] >= values[i - 1] * 0.9) rising++;
      return rising / reached >= 0.8 ? reached * window : 0;
    };
    start = crop(envelope.slice(0, quarter));
    end = frames - crop(envelope.slice(-quarter).reverse());
  }
  const length = end - start;
  const overlap = preserveNative ? 0 : Math.min(Math.round(crossfade_seconds * sampleRate), Math.floor(length / 4));
  if (!preserveNative && overlap < Math.max(2, Math.round(0.05 * sampleRate)))
    throw new Error('Recording is too short for a loop; retain at least 0.2 seconds or choose another recording');
  const split = start + Math.floor(length / 2);
  const output = preserveNative ? samples.slice() : new Float32Array((length - overlap) * channels);
  const join = end - split - overlap;
  if (!preserveNative) {
    output.set(samples.subarray(split * channels, (end - overlap) * channels));
    for (let frame = 0; frame < overlap; frame++) {
      const t = frame / (overlap - 1);
      const a = curve === 'equal-power' ? Math.cos(t * Math.PI / 2) : 1 - t;
      const b = curve === 'equal-power' ? Math.sin(t * Math.PI / 2) : t;
      for (let channel = 0; channel < channels; channel++)
        output[(join + frame) * channels + channel] =
          samples[(end - overlap + frame) * channels + channel] * a + samples[(start + frame) * channels + channel] * b;
    }
    output.set(samples.subarray((start + overlap) * channels, split * channels), (join + overlap) * channels);
  }
  let peak = 0;
  for (const value of output) peak = Math.max(peak, Math.abs(value));
  if (!Number.isFinite(peak)) throw new Error('Loop mix overflow; choose a source with finite audio levels');
  const target = 10 ** (peak_db / 20);
  // Never boost near-silence. Even with normalization off, respect the export ceiling.
  const gain = peak === 0 ? 1 : normalize && peak >= 0.0001 ? target / peak : Math.min(1, target / peak);
  for (let i = 0; i < output.length; i++) output[i] *= gain;
  return { samples: output, evidence: {
    processing_version: preserveNative ? 'native-gain-v1' : 'rotate-crossfade-v1', start_sample: start, end_sample: end,
    split_sample: preserveNative ? null : split, overlap_frames: overlap, crossfade_start_frame: preserveNative ? null : join, curve: preserveNative ? null : curve,
    sample_rate: sampleRate, channels, gain_db: 20 * Math.log10(gain), input_peak: peak,
    output_frames: length - overlap, edge_mode: preserveNative ? 'native-preserved' : explicit ? 'manual' : 'conservative-energy',
    native_provider_loop: options.native_provider_loop === true, ...(native ? { native_assessment: native } : {}),
  } };
}

// Read the preserved PCM directly: decodeAudioData would resample to the device rate before editing.
export function decodeLoopWav(buffer) {
  const bytes = new DataView(buffer);
  const tag = offset => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  if (bytes.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Expected a PCM WAV source');
  let channels, sampleRate, pcm;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const size = bytes.getUint32(offset + 4, true), start = offset + 8;
    if (start + size > bytes.byteLength) throw new Error('Truncated WAV source');
    if (tag(offset) === 'fmt ') {
      if (size < 16 || bytes.getUint16(start, true) !== 1 || bytes.getUint16(start + 14, true) !== 16) throw new Error('Expected PCM16 WAV source');
      channels = bytes.getUint16(start + 2, true); sampleRate = bytes.getUint32(start + 4, true);
    }
    if (tag(offset) === 'data') pcm = { start, size };
    offset = start + size + size % 2;
  }
  if (channels !== 2 || sampleRate !== 44100 || !pcm?.size || pcm.size % (channels * 2)) throw new Error('Expected stereo 44100 Hz PCM16 source');
  const samples = new Float32Array(pcm.size / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = bytes.getInt16(pcm.start + i * 2, true) / 32768;
  return { samples, channels, sampleRate };
}

export function quantizeLoop(samples) {
  return samples.map(sample => Math.max(-32768, Math.min(32767, Math.round(sample * 32768))) / 32768);
}
