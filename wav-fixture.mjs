export const wavFixture = (active = () => true, seconds = 1) => {
  const bytes = Buffer.alloc(44 + Math.round(44100 * seconds) * 4);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(44100, 24);
  bytes.writeUInt32LE(176400, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let frame = 0; frame < Math.round(44100 * seconds); frame++) {
    const time = frame / 44100;
    const sample = active(time) ? Math.round(2000 * Math.sin(2 * Math.PI * 440 * time)) : 0;
    bytes.writeInt16LE(sample, 44 + frame * 4);
    bytes.writeInt16LE(sample, 46 + frame * 4);
  }
  return bytes;
};
