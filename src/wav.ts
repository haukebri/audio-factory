export function inspectWav(bytes: Buffer) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE")
    throw new Error("Expected RIFF WAV");
  let channels = 0;
  let sampleRate = 0;
  let pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const name = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) throw new Error("Truncated WAV chunk");
    if (name === "fmt ") {
      if (size < 16 || bytes.readUInt16LE(start) !== 1 || bytes.readUInt16LE(start + 14) !== 16)
        throw new Error("Expected PCM16 WAV");
      channels = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
    }
    if (name === "data") pcm = bytes.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!pcm?.length || channels !== 2 || sampleRate !== 44100 || pcm.length % (channels * 2))
    throw new Error("Expected nonempty stereo 44100 Hz WAV");
  let peak = 0;
  let energy = 0;
  for (let i = 0; i < pcm.length; i += 2) {
    const sample = pcm.readInt16LE(i) / 32768;
    peak = Math.max(peak, Math.abs(sample));
    energy += sample * sample;
  }
  if (peak > 0.708) throw new Error(`Audio peak outside -3 dB budget: ${peak}`);
  return {
    sample_rate: sampleRate,
    channels,
    seconds: pcm.length / (channels * 2 * sampleRate),
    peak,
    rms: Math.sqrt(energy / (pcm.length / 2)),
    bytes: bytes.length,
  };
}
