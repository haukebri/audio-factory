import { createServer } from 'node:http';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync, statSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { acquire, bounds, convert, fail, MAX_BYTES, publicError, readiness, runtime, search, videoURL } from './audio.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
const jsonFile = (path, value) => { writeFileSync(path + '.tmp', JSON.stringify(value)); renameSync(path + '.tmp', path); };
const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
async function body(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 8192) throw fail('Request too large.', 413); }
  try { const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; } catch { throw fail('Expected a JSON object.'); }
}

export async function startServer({ port = Number(process.env.YOUTUBE_POC_PORT || 8768), data = process.env.YOUTUBE_POC_DATA || join(runtime, 'data') } = {}) {
  mkdirSync(data, { recursive: true });
  const lock = join(data, 'owner.json');
  if (existsSync(lock)) {
    const owner = JSON.parse(readFileSync(lock));
    try { process.kill(owner.pid, 0); throw fail('This proof-of-concept data folder is already in use.', 409); }
    catch (e) { if (e.code !== 'ESRCH') throw e; }
    rmSync(lock);
  }
  const fd = openSync(lock, 'wx'); writeFileSync(fd, JSON.stringify({ pid: process.pid })); closeSync(fd);
  const clipsDir = join(data, 'clips'), jobsDir = join(data, 'jobs'), tempDir = join(data, 'temporary');
  for (const dir of [clipsDir, jobsDir, tempDir]) mkdirSync(dir, { recursive: true });
  const jobs = new Map(), clips = new Map();
  const save = job => { jsonFile(join(jobsDir, job.id + '.json'), job); jobs.set(job.id, job); };
  for (const id of readdirSync(clipsDir).filter(id => /^[a-f0-9]{24}$/.test(id))) {
    const clip = JSON.parse(readFileSync(join(clipsDir, id, 'clip.json')));
    if (existsSync(join(clipsDir, id, 'audio.wav'))) clips.set(id, clip);
  }
  for (const name of readdirSync(jobsDir).filter(name => /^[a-f0-9]{24}\.json$/.test(name))) {
    const job = JSON.parse(readFileSync(join(jobsDir, name)));
    if (clips.has(job.id)) Object.assign(job, { status: 'completed', stage: 'Ready', clip: clips.get(job.id) });
    else if (job.status === 'running' || job.status === 'completed') Object.assign(job, { status: 'interrupted', stage: 'Interrupted', error: 'Import did not finish. Submit again to retry.' });
    save(job);
  }
  for (const name of readdirSync(tempDir)) rmSync(join(tempDir, name), { recursive: true, force: true });
  let active, searching, closing = false;
  const tools = await readiness();
  function submit(id, work) {
    if (closing) throw fail('Server is stopping.', 503);
    if (jobs.get(id)?.status === 'completed' || (active?.job.id === id)) return jobs.get(id);
    if (active) throw fail('Another clip is processing. Wait or cancel it first.', 409);
    const job = { id, status: 'running', stage: 'Starting', started_at: new Date().toISOString() };
    const controller = new AbortController(), temp = join(tempDir, randomUUID());
    mkdirSync(temp); save(job);
    const stage = message => { controller.signal.throwIfAborted(); job.stage = message; save(job); };
    active = { job, controller };
    active.promise = (async () => {
      try {
        const result = await work(temp, { signal: controller.signal, stage });
        controller.signal.throwIfAborted();
        const clip = { id, title: result.title, duration: result.duration, url: `/audio/${id}.wav` };
        for (const name of readdirSync(temp)) if (name !== 'audio.wav') rmSync(join(temp, name), { force: true, recursive: true });
        jsonFile(join(temp, 'clip.json'), clip);
        renameSync(temp, join(clipsDir, id));
        clips.set(id, clip);
        Object.assign(job, { status: 'completed', stage: 'Ready', clip });
      } catch (e) {
        Object.assign(job, { status: controller.signal.aborted ? 'canceled' : 'failed', stage: controller.signal.aborted ? 'Canceled' : 'Failed', error: publicError(e) });
      } finally {
        rmSync(temp, { recursive: true, force: true });
        save(job); active = undefined;
      }
    })();
    return job;
  }
  const server = createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; frame-src https://www.youtube.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) throw fail('Open the app at its 127.0.0.1 address.', 403);
      if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-poc'] !== '1') throw fail('Missing local request header.', 403);
      const url = new URL(req.url, origin), path = url.pathname;
      if (req.method === 'GET' && path === '/api/state') return json(res, 200, { ...tools, jobs: [...jobs.values()], clips: [...clips.values()].reverse() });
      if (req.method === 'POST' && path === '/api/search') {
        if (searching) throw fail('A search is already running.', 409);
        const input = await body(req), controller = new AbortController(); searching = controller;
        const disconnected = () => { if (!res.writableEnded) controller.abort(fail('Search disconnected.')); };
        res.on('close', disconnected);
        try { return json(res, 200, { results: await search(input.query, { signal: controller.signal }) }); }
        finally { searching = undefined; res.off('close', disconnected); }
      }
      if (req.method === 'POST' && path === '/api/import') {
        const input = await body(req), normalized = { url: videoURL(input.url), ...bounds(input) };
        const job = submit(sha(['youtube', normalized.url, normalized.start, normalized.end]), (temp, options) => acquire(normalized, temp, options));
        return json(res, 202, job);
      }
      if (req.method === 'POST' && path === '/api/upload') {
        const input = bounds({ start: Number(url.searchParams.get('start')), end: Number(url.searchParams.get('end')) });
        if (Number(req.headers['content-length']) > MAX_BYTES) throw fail('File exceeds 256 MiB.', 413);
        // Uploads use fresh IDs; browser disables repeated submissions while receiving.
        let receive;
        const job = submit(sha(['upload', randomUUID()]), async (temp, options) => {
          options.stage('Receiving local file');
          let bytes = 0;
          const limit = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; callback(bytes > MAX_BYTES ? fail('File exceeds 256 MiB.', 413) : null, chunk); } });
          const source = join(temp, 'upload');
          receive = pipeline(req, limit, createWriteStream(source, { flags: 'wx' }), { signal: AbortSignal.any([options.signal, AbortSignal.timeout(120000)]) });
          await receive;
          options.stage('Converting local file');
          return { duration: await convert(source, join(temp, 'audio.wav'), input, options), title: `Local clip · ${input.start}–${input.end}s` };
        });
        await receive;
        return json(res, 202, job);
      }
      const trim = path.match(/^\/api\/clips\/([a-f0-9]{24})\/trim$/);
      if (req.method === 'POST' && trim) {
        const clip = clips.get(trim[1]); if (!clip) throw fail('Clip not found.', 404);
        const input = bounds(await body(req), clip.duration);
        return json(res, 202, submit(sha(['trim', clip.id, input]), async (temp, options) => {
          options.stage('Saving edited WAV');
          return { duration: await convert(join(clipsDir, clip.id, 'audio.wav'), join(temp, 'audio.wav'), input, options), title: `Edited clip · ${input.start}–${input.end}s · ${input.gain} dB` };
        }));
      }
      const jobMatch = path.match(/^\/api\/jobs\/([a-f0-9]{24})$/);
      if (jobMatch && ['GET', 'DELETE'].includes(req.method)) {
        const job = jobs.get(jobMatch[1]); if (!job) throw fail('Job not found.', 404);
        if (req.method === 'DELETE' && active?.job.id === job.id) { job.stage = 'Canceling'; save(job); active.controller.abort(fail('Canceled by user.')); }
        return json(res, 200, job);
      }
      const audio = path.match(/^\/audio\/([a-f0-9]{24})\.wav$/);
      if (['GET', 'HEAD'].includes(req.method) && audio) {
        if (!clips.has(audio[1])) throw fail('Clip not found.', 404);
        const file = join(clipsDir, audio[1], 'audio.wav'), size = statSync(file).size;
        let start = 0, end = size - 1, status = 200;
        if (req.headers.range) {
          const range = req.headers.range.match(/^bytes=(\d+)-(\d*)$/);
          if (!range || Number(range[1]) >= size || (range[2] && Number(range[2]) < Number(range[1]))) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
          start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end; status = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        }
        res.writeHead(status, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'private, max-age=31536000, immutable' });
        if (req.method === 'HEAD') return res.end();
        const stream = createReadStream(file, { start, end }); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); return stream.pipe(res);
      }
      const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'] };
      if (req.method === 'GET' && assets[path]) {
        const [name, type] = assets[path]; res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); return res.end(readFileSync(join(directory, name)));
      }
      throw fail('Not found.', 404);
    } catch (e) { if (!res.headersSent && !res.destroyed) json(res, e.status || 500, { error: publicError(e) }); else res.destroy(); }
  });
  server.requestTimeout = 130000;
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
  catch (e) { rmSync(lock, { force: true }); throw e; }
  const close = async () => {
    if (closing) return; closing = true;
    const finished = new Promise(resolve => server.close(resolve));
    searching?.abort(fail('Server stopping.')); active?.controller.abort(fail('Server stopping.'));
    await active?.promise; await finished; rmSync(lock, { force: true });
  };
  return { server, close, url: `http://127.0.0.1:${server.address().port}`, data };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await startServer();
  console.log(`Sound scout: ${app.url}\nClips: ${app.data}/clips`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().catch(console.error));
}
