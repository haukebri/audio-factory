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
  const leveled = applyLevel(output, sampleRate, channels, options.gain_db ?? 0, true);
  return { ...leveled, evidence: {
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

// Use the same prepared cleanup in the browser and export; slider changes need no subprocess.
export function mixNoiseReduction(original, cleaned, strength) {
  if (!Number.isFinite(strength) || strength < 0 || strength > 24 ||
      !(original instanceof Float32Array) || !(cleaned instanceof Float32Array) || original.length !== cleaned.length)
    throw new Error('Choose noise reduction from 0 to 24 dB with matching source samples.');
  if (!strength) return original;
  if (strength === 24) return cleaned;
  const wet = (1 - 10 ** (-strength / 20)) / (1 - 10 ** (-24 / 20));
  return original.map((sample, i) => sample + wet * (cleaned[i] - sample));
}

// Shared post-normalization gain and stereo-linked, latency-compensated peak limiter.
export function applyLevel(samples, sampleRate, channels, gainDb = 0, loop = false) {
  if (!Number.isFinite(gainDb) || gainDb < -12 || gainDb > 12) throw new Error('Choose a level from -12 to +12 dB');
  const amplitude = 10 ** (gainDb / 20);
  const output = samples.map(value => value * amplitude);
  const frames = output.length / channels, ceiling = 10 ** (-0.1 / 20);
  const peaks = new Float32Array(frames);
  let peak = 0;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) peaks[frame] = Math.max(peaks[frame], Math.abs(output[frame * channels + channel]));
    peak = Math.max(peak, peaks[frame]);
  }
  if (!Number.isFinite(peak)) throw new Error('Nonfinite level sample');
  let reduction = 1;
  if (peak > ceiling) {
    const lookahead = Math.min(frames - 1, Math.round(sampleRate * 0.005));
    const release = Math.exp(-1 / (sampleRate * 0.05));
    const required = new Float64Array(frames), deque = new Int32Array(frames + lookahead);
    let head = 0, tail = 0;
    for (let i = frames + lookahead - 1; i >= 0; i--) {
      const value = i < frames || loop ? peaks[i % frames] : 0;
      while (tail > head && deque[head] > i + lookahead) head++;
      while (tail > head && (deque[tail - 1] < frames || loop ? peaks[deque[tail - 1] % frames] : 0) <= value) tail--;
      deque[tail++] = i;
      if (i < frames) required[i] = Math.min(1, ceiling / (peaks[deque[head] % frames] || ceiling));
    }
    // At a loop boundary, solve the periodic release envelope instead of resetting it.
    let envelope = 1;
    if (loop) for (const value of required) envelope = Math.min(value, 1 - (1 - envelope) * release);
    for (let frame = 0; frame < frames; frame++) {
      envelope = Math.min(required[frame], 1 - (1 - envelope) * release);
      reduction = Math.min(reduction, envelope);
      for (let channel = 0; channel < channels; channel++) output[frame * channels + channel] *= envelope;
    }
  }
  return { samples: output, level: { adjustment_db: gainDb, limiter_reduction_db: -20 * Math.log10(reduction) } };
}

export function trimFades(frames, sampleRate, { fade_in_ms = 10, fade_out_ms = 100 } = {}) {
  if (!Number.isInteger(frames) || frames < 1 || !Number.isInteger(sampleRate) || sampleRate < 1 ||
      ![fade_in_ms, fade_out_ms].every(value => Number.isFinite(value) && value >= 0))
    throw new Error('Choose valid fade durations and audio frames');
  const total = (fade_in_ms + fade_out_ms) * sampleRate / 1000;
  const scale = total ? Math.min(1, frames / (2 * total)) : 1;
  return { in_frames: Math.floor(fade_in_ms * sampleRate / 1000 * scale),
    out_frames: Math.floor(fade_out_ms * sampleRate / 1000 * scale) };
}

export function renderTrim(samples, sampleRate, channels, options = {}) {
  const { start_seconds = 0, end_seconds = samples.length / channels / sampleRate,
    fade_ms, peak_db = -3, normalize = true } = options;
  const start = Math.round(start_seconds * sampleRate), end = Math.round(end_seconds * sampleRate);
  if (!(samples instanceof Float32Array) || !Number.isInteger(sampleRate) || sampleRate < 1 ||
      !Number.isInteger(channels) || channels < 1 || samples.length % channels || samples.some(value => !Number.isFinite(value)) ||
      !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > samples.length / channels || end <= start ||
      (fade_ms !== undefined && (!Number.isFinite(fade_ms) || fade_ms < 0)) || !Number.isFinite(peak_db) || peak_db < -30 || peak_db > -3 || typeof normalize !== 'boolean')
    throw new Error('Choose valid trim bounds, fades and normalization');
  const output = samples.slice(start * channels, end * channels), frames = end - start;
  const legacy = fade_ms !== undefined, fades = trimFades(frames, sampleRate, options);
  const fade = legacy ? Math.min(fade_ms / 1000, frames / sampleRate / 2) : Math.max(fades.in_frames, fades.out_frames) / sampleRate;
  // FFmpeg parses duration options in microseconds, then rounds to source frames.
  const fadeFrames = Math.floor((Math.trunc(fade * 1e6) * sampleRate + 5e5) / 1e6);
  const fadeStart = Math.floor((Math.trunc((frames / sampleRate - fade) * 1e6) * sampleRate + 5e5) / 1e6);
  let peak = 0;
  const cosine = value => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, value)))) / 2;
  for (let frame = 0; frame < frames; frame++) {
    const fadeIn = legacy ? (fadeFrames ? Math.min(1, frame / fadeFrames) : 1)
      : frame === 0 ? 0 : fades.in_frames ? cosine(frame / fades.in_frames) : 1;
    const fadeOut = legacy ? (fadeFrames ? Math.min(1, Math.max(0, (fadeStart + fadeFrames - frame) / fadeFrames)) : 1)
      : frame === frames - 1 ? 0 : fades.out_frames ? cosine((frames - 1 - frame) / fades.out_frames) : 1;
    for (let channel = 0; channel < channels; channel++) {
      const i = frame * channels + channel;
      // Match the original FFmpeg PCM16 fade stages before measuring normalization.
      output[i] = legacy ? Math.trunc(Math.trunc(output[i] * 32768 * fadeIn) * fadeOut) / 32768 : output[i] * fadeIn * fadeOut;
      peak = Math.max(peak, Math.abs(output[i]));
    }
  }
  const gain = !normalize || peak === 0 ? 0 : peak_db - 20 * Math.log10(peak);
  const amplitude = 10 ** (gain / 20);
  for (let i = 0; i < output.length; i++) output[i] *= amplitude;
  return { ...applyLevel(output, sampleRate, channels, options.gain_db ?? 0), evidence: {
    start_sample: start, end_sample: end, sample_rate: sampleRate, fade_seconds: fade,
    ...(!legacy ? { processing_version: 'cosine-fades-v1', fade_in_seconds: fades.in_frames / sampleRate, fade_out_seconds: fades.out_frames / sampleRate } : {}),
    input_peak: peak, gain_db: gain, output_frames: frames,
  } };
}
