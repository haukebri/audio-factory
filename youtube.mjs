import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { processIdentity } from './dist/ownership.js';
import { spawn } from 'node:child_process';
import { readdir, readFile, stat, statfs, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectWav } from './dist/wav.js';
import { renderTrim, quantizeLoop } from './loop-audio.mjs';
export const runtime = fileURLToPath(new URL('./.runtime/youtube/', import.meta.url));
export const ytdlp = join(runtime, 'venv/bin/yt-dlp');
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
export function importInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join() !== 'end_seconds,start_seconds,url') throw fail('Expected URL and start/end seconds.');
  const { start_seconds: start, end_seconds: end } = input;
  if (![start, end].every(Number.isFinite) || start < 0 || end <= start || end - start > 60 ||
      !Number.isSafeInteger(Math.round(start * 44100)) || !Number.isSafeInteger(Math.round(end * 44100)) || Math.round((end - start) * 44100) < 1)
    throw fail('Choose a positive interval of up to 60 seconds, containing at least one decoded sample.');
  return { url: videoURL(input.url), start_seconds: start, end_seconds: end };
}

// Each subprocess owns its process group, including FFmpeg spawned by yt-dlp.
export function run(command, args, { signal, timeout = 120000, directory, maxOutput = 4 * 1024 * 1024, owner } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let ownershipFile;
    let chunks = [], bytes = 0, stderr = '', failure, timer, monitor, scanning = false, finished = false;
    const kill = () => { try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch {} };
    const stop = error => { if (!failure && !finished) { failure = error; kill(); } };
    const abort = () => stop(signal.reason || fail('Canceled.', 499));
    if (owner && child.pid) {
      try {
        const identity = processIdentity(child.pid);
        if (identity) {
          const registry = join(owner.root, '.runtime/youtube-processes'); mkdirSync(registry, { recursive: true, mode: 0o700 });
          ownershipFile = join(registry, `${owner.job_id}-${randomUUID()}.json`);
          writeFileSync(ownershipFile, JSON.stringify({ pid: child.pid, identity, session: { pid: process.pid, identity: processIdentity(process.pid) } }), { flag: 'wx', mode: 0o600 });
        }
      } catch (error) { stop(error); }
    }
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
      if (ownershipFile) { try { unlinkSync(ownershipFile); } catch (error) { if (error.code !== 'ENOENT') failure ??= error; } }
      signal?.removeEventListener('abort', abort);
      if (failure || error || code !== 0) reject(failure || error || fail(`${command.split('/').at(-1)}: ${stderr.trim() || `exit ${code}`}`, 502));
      else resolve({ stdout: Buffer.concat(chunks, bytes), stderr });
    };
    child.once('error', e => done(null, e));
    child.once('close', code => done(code));
    if (signal?.aborted) abort();
  });
}

export async function recoverAcquisition(root, jobId) {
  const registry = join(root, '.runtime/youtube-processes');
  for (const file of await readdir(registry).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
    if (!file.startsWith(jobId + '-')) continue;
    const path = join(registry, file), owner = JSON.parse(await readFile(path, 'utf8'));
    if (owner.session.pid !== process.pid && owner.session.identity && processIdentity(owner.session.pid) === owner.session.identity)
      throw new Error('Acquisition still owned by another live session');
    if (owner.identity && processIdentity(owner.pid) === owner.identity) {
      try { process.platform === 'win32' ? process.kill(owner.pid, 'SIGKILL') : process.kill(-owner.pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    await rm(path, { force: true });
  }
}

export async function readiness({ root = fileURLToPath(new URL('.', import.meta.url)) } = {}) {
  const tools = await Promise.all([['yt-dlp', ytdlp, ['--version']], ['FFmpeg', 'ffmpeg', ['-version']], ['ffprobe', 'ffprobe', ['-version']], ['Node', process.execPath, ['--version']]].map(async ([name, command, args]) => {
    try {
      const result = await run(command, args, { timeout: 10000 });
      const version = result.stdout.toString().split('\n')[0];
      if (name === 'yt-dlp') {
        if (version !== '2026.08.19') throw new Error('Expected yt-dlp 2026.08.19');
        await run(command, ['--ignore-config', '--js-runtimes', `node:${process.execPath}`, '--help'], { timeout: 10000 });
        const ejs = await run(join(runtime, 'venv/bin/python'), ['-c', 'from importlib.metadata import version; print(version("yt-dlp-ejs"))'], { timeout: 10000 });
        if (ejs.stdout.toString().trim() !== '0.8.0') throw new Error('Expected EJS 0.8.0');
      }
      if (name === 'Node' && Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 or newer required');
      return { name, version };
    } catch (e) { return { name, error: name === 'yt-dlp' ? `${e.message}. Run node scripts/setup-youtube.mjs` : e.message }; }
  }));
  let temporary;
  try {
    const directory = join(root, '.runtime'); await mkdir(directory, { recursive: true });
    const disk = await statfs(directory);
    if (disk.bavail * disk.bsize < 300 * 1024 * 1024) throw new Error('At least 300 MiB free storage required');
    temporary = await mkdtemp(join(directory, 'youtube-ready-'));
    await writeFile(join(temporary, 'probe'), 'ready', { flag: 'wx' });
    tools.push({ name: 'Storage', version: 'Writable; at least 300 MiB free' });
  } catch (e) { tools.push({ name: 'Storage', error: e.message }); }
  finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
  return { tools, ready: tools.every(t => !t.error) };
}

export async function search(query, { signal } = {}) {
  if (typeof query !== 'string' || !query.trim() || query.length > 300) throw fail('Enter a sound query up to 300 characters.');
  const { stdout } = await run(ytdlp, [...base, '--flat-playlist', '--skip-download', '--dump-single-json', `ytsearch10:${query.trim()}`], { signal, timeout: 60000 });
  const entries = JSON.parse(stdout).entries || [];
  return [...new Map(entries.filter(e => /^[\w-]{11}$/.test(e?.id || '')).map(e => [e.id, { id: e.id, title: String(e.title || e.id).slice(0, 300), url: `https://www.youtube.com/watch?v=${e.id}` }])).values()].slice(0, 10);
}

export async function probe(file, signal, owner) {
  const { stdout } = await run('ffprobe', ['-v', 'error', ...localInput, '-show_entries', 'format=duration:stream=codec_type,sample_rate,channels,codec_name', '-of', 'json', file], { signal, owner });
  const data = JSON.parse(stdout), duration = Number(data.format?.duration);
  if (!data.streams?.some(s => s.codec_type === 'audio') || !Number.isFinite(duration) || duration <= 0) throw fail('File contains no usable finite audio.');
  return { duration, streams: data.streams };
}

export async function convert(source, output, input, { signal, owner } = {}) {
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(120000)]);
  const { start, end } = input;
  const info = await probe(source, signal, owner);
  const wanted = Math.round((end - start) * 44100);
  if (![start, end].every(Number.isFinite) || start < 0 || end <= start || end - start > 60 || wanted < 1 || end > info.duration + 1 / 44100) throw fail('Requested interval is outside the decoded audio.');
  const { stdout: pcm } = await run('ffmpeg', ['-nostdin', '-v', 'error', ...localInput, '-i', source, '-ss', String(start), '-t', String(end - start), '-map', '0:a:0', '-ar', '44100', '-ac', '2', '-f', 'f32le', '-'], { signal, owner, maxOutput: 64 * 1024 * 1024 });
  const frames = pcm.length / 8;
  if (!Number.isInteger(frames) || frames < wanted || frames - wanted > 2) throw fail('Decoded audio did not cover the requested interval. Choose an earlier end.');
  const samples = new Float32Array(wanted * 2);
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readFloatLE(i * 4);
  // Source normalization uses the same renderer as Studio, without cropping or fades.
  const normalized = quantizeLoop(renderTrim(samples, 44100, 2, { fade_ms: 0 }).samples);
  const wav = Buffer.alloc(44 + wanted * 4);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(176400, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wanted * 4, 40);
  for (let i = 0; i < normalized.length; i++) wav.writeInt16LE(normalized[i] * 32768, 44 + i * 2);
  const audio = inspectWav(wav);
  signal.throwIfAborted(); await writeFile(output, wav, { flag: 'wx' });
  return audio;
}

export async function acquire(input, directory, { signal, stage = () => {}, owner } = {}) {
  const { url, start_seconds: start, end_seconds: end } = importInput(input);
  const callerSignal = signal;
  const deadline = AbortSignal.timeout(600000);
  signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  await stage('Checking video');
  const { stdout } = await run(ytdlp, [...base, '--skip-download', '--dump-single-json', url], { signal, owner, timeout: 60000 });
  const meta = JSON.parse(stdout);
  if (meta.is_live || meta.is_upcoming || ['is_live', 'is_upcoming', 'post_live'].includes(meta.live_status)) throw fail('Choose a finished video, not a live or upcoming stream.');
  if (!Number.isFinite(meta.duration) || end > meta.duration) throw fail('Requested interval is outside the video.');
  const from = Math.max(0, start - 1), to = Math.min(meta.duration, end + 1);
  const common = [...base, '-f', 'bestaudio', '--max-filesize', String(MAX_BYTES), '--no-progress', '--no-part', '-o', join(directory, 'source.%(ext)s')];
  let offset = from;
  await stage('Downloading audio window');
  try {
    await run(ytdlp, [...common, '--download-sections', `*${from}-${to}`, url], { signal, owner, timeout: 600000, directory });
  } catch (error) {
    signal.throwIfAborted();
    if (error.status === 413 || meta.duration > 600) throw error;
    for (const name of await readdir(directory)) if (name.startsWith('source.')) await rm(join(directory, name), { force: true });
    await stage('Retrying with complete short recording');
    await run(ytdlp, [...common, url], { signal, owner, timeout: 600000, directory });
    offset = 0;
  }
  const files = (await readdir(directory)).filter(name => /^source\.[a-z0-9]+$/.test(name));
  if (files.length !== 1) throw fail('Downloader produced no single usable audio file.');
  const source = join(directory, files[0]);
  if ((await stat(source)).size > MAX_BYTES) throw fail('Download exceeded 256 MiB.', 413);
  await stage('Converting to WAV');
  const file = join(directory, 'audio.wav');
  try { const audio = await convert(source, file, { start: start - offset, end: end - offset }, { signal: callerSignal, owner }); return { file, audio }; }
  finally { await rm(source, { force: true }); }
}

export function publicError(error) {
  const message = String(error.message || error).replace(/https?:\/\/[^\s]+/g, '[remote URL]');
  if (/429|rate.limit|too many requests/i.test(message)) return `YouTube rate limit. Wait and retry. ${message.slice(-500)}`;
  if (/sign in|login|cookies|private|age.restrict|not available|unavailable|403|bot|PO Token/i.test(message)) return `YouTube access failed. Try another public video. ${message.slice(-500)}`;
  if (error.code === 'ENOENT') return 'YouTube tool missing. Run node scripts/setup-youtube.mjs before retrying.';
  if (/decoded|audio|PCM|WAV|sample|interval|duration/i.test(message)) return `Invalid audio: ${message.slice(-800)}`;
  return message.slice(-1000);
}
