import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, stat, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const runtime = fileURLToPath(new URL('../../.runtime/youtube-poc/', import.meta.url));
export const ytdlp = process.env.YOUTUBE_POC_YTDLP || (existsSync(join(runtime, 'venv/bin/yt-dlp')) ? join(runtime, 'venv/bin/yt-dlp') : 'yt-dlp');
export const MAX_BYTES = 256 * 1024 * 1024;
const base = ['--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--js-runtimes', `node:${process.execPath}`, '--socket-timeout', '20', '--retries', '2', '--fragment-retries', '2', '--retry-sleep', 'http:2', '--no-playlist'];
const localInput = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,wav,mp3,ogg,flac,aac,aiff'];
export const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function videoURL(input) {
  let u;
  try { u = new URL(input); } catch { throw fail('Enter a valid HTTPS YouTube video URL.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.searchParams.has('list')) throw fail('Use one HTTPS YouTube video, without a playlist.');
  let id;
  if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname)) {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else id = u.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})\/?$/)?.[1];
  }
  if (!/^[\w-]{11}$/.test(id || '')) throw fail('Use a YouTube watch, Shorts or youtu.be video URL.');
  return `https://www.youtube.com/watch?v=${id}`;
}
export function bounds(input, duration = Infinity) {
  const { start, end, gain = 0 } = input;
  if (![start, end, gain].every(Number.isFinite) || start < 0 || end <= start || end - start > 60 || end > duration + 1 / 44100 || gain < -12 || gain > 12) {
    throw fail('Choose 0–60 seconds within the clip and gain between −12 and +12 dB.');
  }
  return { start, end, gain };
}

// Each subprocess owns its process group, including FFmpeg spawned by yt-dlp.
export function run(command, args, { signal, timeout = 120000, directory, maxOutput = 4 * 1024 * 1024 } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let chunks = [], bytes = 0, stderr = '', failure, timer, monitor, scanning = false, finished = false;
    const kill = () => { try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch {} };
    const stop = error => { if (!failure && !finished) { failure = error; kill(); } };
    const abort = () => stop(signal.reason || fail('Canceled.', 499));
    timer = setTimeout(() => stop(fail('Operation exceeded its time budget.', 504)), timeout);
    // ponytail: disk limit checked every 200ms; an OS quota is needed for a strict instantaneous cap.
    if (directory) monitor = setInterval(async () => {
      if (scanning) return;
      scanning = true;
      try {
        const files = await readdir(directory);
        const sizes = await Promise.all(files.map(name => stat(join(directory, name)).then(s => s.size).catch(() => 0)));
        if (sizes.reduce((a, b) => a + b, 0) > MAX_BYTES) stop(fail('Download exceeded 256 MiB.', 413));
      } catch (e) { stop(e); } finally { scanning = false; }
    }, 200);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', data => {
      if (bytes + data.length > maxOutput) return stop(fail('Tool output exceeded its limit.', 413));
      chunks.push(data); bytes += data.length;
    });
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-6000); });
    const done = (code, error) => {
      if (finished) return; finished = true;
      clearTimeout(timer); clearInterval(monitor);
      signal?.removeEventListener('abort', abort);
      if (failure || error || code !== 0) reject(failure || error || fail(`${command.split('/').at(-1)}: ${stderr.trim() || `exit ${code}`}`, 502));
      else resolve({ stdout: Buffer.concat(chunks, bytes), stderr });
    };
    child.once('error', e => done(null, e));
    child.once('close', code => done(code));
    if (signal?.aborted) abort();
  });
}

export async function readiness() {
  const tools = await Promise.all([['yt-dlp', ytdlp, ['--version']], ['FFmpeg', 'ffmpeg', ['-version']], ['ffprobe', 'ffprobe', ['-version']], ['Node', process.execPath, ['--version']]].map(async ([name, command, args]) => {
    try {
      const result = await run(command, args, { timeout: 10000 });
      const version = result.stdout.toString().split('\n')[0];
      if (name === 'yt-dlp') await run(command, ['--ignore-config', '--js-runtimes', `node:${process.execPath}`, '--help'], { timeout: 10000 });
      return { name, version };
    } catch (e) { return { name, version: '', error: name === 'yt-dlp' ? 'Run the isolated setup in experiments/youtube-sounds/README.md.' : e.message }; }
  }));
  return { tools, ready: tools.every(t => !t.error) };
}

export async function search(query, { signal } = {}) {
  if (typeof query !== 'string' || !query.trim() || query.length > 300) throw fail('Enter a sound query up to 300 characters.');
  const { stdout } = await run(ytdlp, [...base, '--flat-playlist', '--skip-download', '--dump-single-json', `ytsearch10:${query.trim()}`], { signal, timeout: 60000 });
  const entries = JSON.parse(stdout).entries || [];
  return [...new Map(entries.filter(e => /^[\w-]{11}$/.test(e?.id || '')).map(e => [e.id, { id: e.id, title: String(e.title || e.id).slice(0, 300), url: `https://www.youtube.com/watch?v=${e.id}` }])).values()].slice(0, 10);
}

export async function probe(file, signal) {
  const { stdout } = await run('ffprobe', ['-v', 'error', ...localInput, '-show_entries', 'format=duration:stream=codec_type,sample_rate,channels,codec_name', '-of', 'json', file], { signal });
  const data = JSON.parse(stdout), duration = Number(data.format?.duration);
  if (!data.streams?.some(s => s.codec_type === 'audio') || !Number.isFinite(duration) || duration <= 0) throw fail('File contains no usable finite audio.');
  return { duration, streams: data.streams };
}

export async function convert(source, output, input, { signal } = {}) {
  const info = await probe(source, signal);
  const { start, end, gain } = bounds(input, info.duration);
  // Decode the requested interval once; bounded float PCM permits exact sample cuts and peak measurement.
  const { stdout: pcm } = await run('ffmpeg', ['-nostdin', '-v', 'error', ...localInput, '-i', source, '-ss', String(start), '-t', String(end - start), '-map', '0:a:0', '-ar', '44100', '-ac', '2', '-f', 'f32le', '-'], { signal, maxOutput: 64 * 1024 * 1024 });
  const frames = pcm.length / 8, wanted = Math.round((end - start) * 44100);
  if (!Number.isInteger(frames) || Math.abs(frames - wanted) > 2) throw fail('Decoded audio did not cover the requested interval. Choose an earlier end.');
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 4) {
    const sample = pcm.readFloatLE(i);
    if (!Number.isFinite(sample)) throw fail('Decoded audio contains invalid samples.');
    peak = Math.max(peak, Math.abs(sample));
  }
  const level = Math.min(10 ** (-0.1 / 20), 10 ** ((-3 + gain) / 20));
  const multiplier = peak ? level / peak : 1;
  const wav = Buffer.alloc(44 + frames * 4);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(176400, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames * 2; i++) wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.readFloatLE(i * 4) * multiplier * 32767))), 44 + i * 2);
  signal?.throwIfAborted();
  await writeFile(output, wav, { flag: 'wx' });
  return frames / 44100;
}

export async function acquire(input, directory, { signal, stage = () => {} } = {}) {
  const url = videoURL(input.url), { start, end } = bounds(input);
  const deadline = AbortSignal.timeout(600000);
  signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  stage('Checking video');
  const { stdout } = await run(ytdlp, [...base, '--skip-download', '--dump-single-json', url], { signal, timeout: 60000 });
  const meta = JSON.parse(stdout);
  if (meta.is_live || meta.is_upcoming || ['is_live', 'is_upcoming', 'post_live'].includes(meta.live_status)) throw fail('Choose a finished video, not a live or upcoming stream.');
  if (!Number.isFinite(meta.duration) || end > meta.duration) throw fail('Requested interval is outside the video.');
  const from = Math.max(0, start - 1), to = Math.min(meta.duration, end + 1);
  const common = [...base, '-f', 'bestaudio', '--max-filesize', String(MAX_BYTES), '--no-progress', '--no-part', '-o', join(directory, 'source.%(ext)s')];
  let offset = from;
  stage('Downloading audio window');
  try {
    await run(ytdlp, [...common, '--download-sections', `*${from}-${to}`, url], { signal, timeout: 600000, directory });
  } catch (error) {
    signal.throwIfAborted();
    if (error.status === 413 || meta.duration > 600) throw error;
    for (const name of await readdir(directory)) if (name.startsWith('source.')) await rm(join(directory, name), { force: true });
    stage('Retrying with complete short recording');
    await run(ytdlp, [...common, url], { signal, timeout: 600000, directory });
    offset = 0;
  }
  const files = (await readdir(directory)).filter(name => /^source\.[a-z0-9]+$/.test(name));
  if (files.length !== 1) throw fail('Downloader produced no single usable audio file.');
  const source = join(directory, files[0]);
  if ((await stat(source)).size > MAX_BYTES) throw fail('Download exceeded 256 MiB.', 413);
  stage('Converting to WAV');
  const duration = await convert(source, join(directory, 'audio.wav'), { start: start - offset, end: end - offset }, { signal });
  return { duration, title: `${new URL(url).searchParams.get('v')} · ${start}–${end}s` };
}

export function publicError(error) {
  const message = String(error.message || error).replace(/https?:\/\/[^\s]+/g, '[remote URL]');
  if (/sign in|login|cookies|private|age.restrict|not available|unavailable|403|429|bot|PO Token/i.test(message)) return `YouTube access failed. Try another video or import a local file. ${message.slice(-800)}`;
  return message.slice(-1000);
}
