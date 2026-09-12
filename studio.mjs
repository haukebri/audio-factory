import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { openBatches } from "./batches.mjs";
import { openJobs } from "./workflow.mjs";

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
async function body(req, limit = 16384) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') fail(415, 'Expected application/json');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413, 'Request body too large'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks)); } catch { fail(400, 'Malformed JSON'); }
}
export async function createStudio({ port = 8767, ...options }) {
  const assets = Object.fromEntries(await Promise.all([['/', 'studio.html', 'text/html; charset=utf-8'], ['/studio.js', 'studio.js', 'text/javascript'], ['/qa-config.json', 'qa-config.json', 'application/json'], ['/loop-audio.mjs', 'loop-audio.mjs', 'text/javascript'], ['/studio.css', 'studio.css', 'text/css']].map(async ([route, file, type]) => [route, { type, bytes: await readFile(new URL(file, import.meta.url)) }])));
  let jobs, batches;
  let closing;
  const sessions = new Map();
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  const server = createServer((req, res) => {
    void (async () => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (req.headers.host !== origin.slice(7)) fail(403, 'Invalid Host');
      if (req.headers.origin && req.headers.origin !== origin) fail(403, 'Foreign Origin');
      if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Cross-site request');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
      const path = req.url; // Exact paths only: no URL normalization of traversal.
      if (req.method === 'GET' && Object.hasOwn(assets, path)) {
        res.writeHead(200, { 'Content-Type': assets[path].type }); res.end(assets[path].bytes); return;
      }
      if (!jobs || !batches) fail(503, 'Studio starting');
      const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('studio_session='))?.slice(15);
      let session = sessions.get(cookie);
      if (session?.expires < Date.now()) { sessions.delete(cookie); session = undefined; }
      if (req.method === 'GET' && path === '/studio/session') {
        if (req.headers['x-studio-bootstrap'] !== '1') fail(403, 'Bootstrap header required');
        if (!session) {
          for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
          if (sessions.size >= 32) fail(429, 'Session limit reached');
          const key = randomBytes(32).toString('hex');
          session = { csrf: randomBytes(32).toString('hex'), expires: Date.now() + 12 * 3600000 };
          sessions.set(key, session);
          res.setHeader('Set-Cookie', `studio_session=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
        }
        json(res, 200, { csrf: session.csrf }); return;
      }
      if (req.headers.authorization) {
        if (req.headers.origin) fail(403, 'Bearer API rejects browser Origin');
        if (req.headers.authorization !== `Bearer ${options.token}`) fail(401, 'Bearer token required');
      } else {
        if (!session) fail(401, 'Browser session required');
        if (req.method !== 'GET' && (req.headers.origin !== origin || req.headers['x-studio-csrf'] !== session.csrf)) fail(403, 'Same-origin mutation credentials required');
      }
      if (path === '/studio/batches') {
        if (req.method === 'GET') { json(res, 200, batches.list()); return; }
        if (req.method === 'POST') { const batch = await batches.submit(req.headers['idempotency-key'], await body(req, 131072)); res.setHeader('Location', `/studio/batches/${batch.id}`); json(res, 202, batch); return; }
      }
      const batchMatch = /^\/studio\/batches\/([a-f0-9]{32})(?:\/(winners|pause|resume)|\/sounds\/([a-zA-Z0-9_-]{1,128})\/(regenerate|recreate))?$/.exec(path);
      if (batchMatch) {
        const [, id, action, assetKey, soundAction] = batchMatch;
        if (req.method === 'GET' && !soundAction && (!action || action === 'winners')) { json(res, 200, action ? batches.winners(id) : batches.get(id)); return; }
        if (req.method === 'POST') {
          const input = await body(req);
          if (['pause', 'resume'].includes(action)) { if (!input || Object.keys(input).length) fail(400, 'Expected empty object'); json(res, 200, await batches.pause(id, action === 'pause')); return; }
          if (soundAction) { json(res, 202, soundAction === 'regenerate' ? await batches.revise(id, assetKey, req.headers['idempotency-key'], input) : await batches.recreate(id, assetKey, req.headers['idempotency-key'], input)); return; }
        }
      }
      if (req.method === 'POST' && ['/studio/qa/setup', '/studio/qa/cancel'].includes(path)) { await body(req); json(res, 202, await jobs.setupQa(path.endsWith('/cancel'))); return; }
      if (req.method === 'GET' && path === '/studio/readiness') { json(res, 200, jobs.readiness()); return; }
      if (req.method === 'GET' && path === '/studio/jobs') { json(res, 200, jobs.list()); return; }
      if (req.method === 'POST' && path === '/studio/jobs') {
        const input = await body(req);
        let job; try { job = await jobs.submit(req.headers['idempotency-key'], input); } catch (error) { error.status ??= 400; throw error; }
        json(res, 202, job); return;
      }
      const jobMatch = /^\/studio\/jobs\/([a-f0-9]{32})(?:\/(cancel|resume|retry|acknowledge|recover|continue))?$/.exec(path);
      if (jobMatch) {
        const [, id, action] = jobMatch;
        if (!jobs.get(id)) fail(404, 'Unknown job');
        if (req.method === 'GET' && !action) { json(res, 200, jobs.get(id)); return; }
        if (req.method === 'POST' && action) {
          const input = await body(req);
          json(res, 202, action === 'recover' ? await jobs.recover(id) : action === 'continue' ? await jobs.continue(id, req.headers['idempotency-key'], input.budget) : action === 'acknowledge' ? await jobs.acknowledge(id) : action === 'cancel' ? await jobs.cancel(id) : action === 'retry' ? await jobs.retry(id, req.headers['idempotency-key']) : await jobs.resume(id, req.headers['idempotency-key'])); return;
        }
      }
      if (path.startsWith('/studio/evaluation')) fail(410, 'Semantic evaluation tools were removed; historical evidence remains in candidate exports');
      if (req.method === 'GET' && path === '/studio/candidates') { json(res, 200, jobs.store.listCandidates()); return; }
      if (req.method === 'GET' && path === '/studio/selections') { json(res, 200, jobs.store.selections()); return; }
      const candidateMatch = /^\/studio\/candidates\/([a-f0-9]{64})(?:\/(source|audio|feedback|export|cut|select|recreate|selection-history))?$/.exec(path);
      if (candidateMatch) {
        const [, id, action] = candidateMatch;
        const candidate = jobs.store.loadCandidate(id);
        if (req.method === 'GET' && !action) { json(res, 200, candidate); return; }
        if (req.method === 'GET' && action === 'selection-history') { json(res, 200, jobs.selectionHistory(id)); return; }
        if (req.method === 'POST' && action === 'select') { json(res, 200, jobs.selectTake(id, await body(req))); return; }
        if (req.method === 'POST' && action === 'recreate') { const input = await body(req); json(res, 202, await jobs.recreate(id, req.headers['idempotency-key'], input)); return; }
        if (req.method === 'POST' && action === 'cut') { json(res, 200, await jobs.cut(id, await body(req))); return; }
        if (action === 'feedback') {
          if (req.method === 'GET') { json(res, 200, jobs.store.history(id)); return; }
          if (req.method === 'POST') {
            const input = await body(req);
            if (input.candidate_sha256 !== id) fail(400, 'Candidate identity mismatch');
            try { json(res, 200, jobs.store.feedback(input)); } catch (error) { error.status = /conflict|Stale/.test(error.message) ? 409 : 400; throw error; } return;
          }
        }
        if (req.method === 'GET' && ['source', 'audio'].includes(action)) {
          const bytes = jobs.store.readAsset(id, action);
          let start = 0, end = bytes.length - 1;
          if (req.headers.range) {
            const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
            if (!range || (!range[1] && !range[2])) fail(416, 'Invalid range');
            start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]));
            end = range[1] && range[2] ? Math.min(Number(range[2]), end) : end;
            if (start > end || start >= bytes.length) fail(416, 'Unsatisfiable range');
            res.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
          }
          res.writeHead(req.headers.range ? 206 : 200, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
          res.end(bytes.subarray(start, end + 1)); return;
        }
        if (req.method === 'GET' && action === 'export') {
          const directory = await mkdtemp(join(tmpdir(), 'audio-studio-export-'));
          try {
            const record = candidate.evidence;
            const names = record.cut ? [`${record.cut.id}.wav`, `${record.cut.id}.json`, record.source_file, 'candidate.json', 'feedback.json'] : ['audio.wav', 'generation.json', 'candidate.json', 'feedback.json'];
            const contents = record.cut ? [jobs.store.readAsset(id, 'audio'), JSON.stringify(record), jobs.store.readAsset(id, 'source'), JSON.stringify(candidate), JSON.stringify(jobs.store.history(id))] : [jobs.store.readAsset(id, 'source'), JSON.stringify(record.generation), JSON.stringify(candidate), JSON.stringify(jobs.store.history(id))];
            names.push('selection-history.json'); contents.push(JSON.stringify(jobs.selectionHistory(id)));
            await Promise.all(names.map((name, i) => writeFile(join(directory, name), contents[i], { mode: 0o600 })));
            const { stdout } = await promisify(execFile)('tar', ['-cf', '-', '-C', directory, ...names], { encoding: 'buffer', timeout: 10000, maxBuffer: 32 * 1024 * 1024 });
            res.writeHead(200, { 'Content-Type': 'application/x-tar', 'Content-Disposition': `attachment; filename="${id}.tar"` }); res.end(stdout);
          } finally { await rm(directory, { recursive: true, force: true }); }
          return;
        }
      }
      fail(404, 'Unknown studio endpoint');
    })().catch(error => { if (!res.headersSent) json(res, error.status ?? (error.code === 'ENOENT' ? 404 : 500), { error: String(error) }); else res.destroy(); });
  });
  server.requestTimeout = 30000;
  const close = () => closing ??= (async () => {
    try { try { await batches?.close(); } finally { await jobs?.close(); } } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
  })();
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    jobs = await openJobs(options);
    batches = await openBatches(jobs, { root: options.root, origin: `http://127.0.0.1:${server.address().port}` });
    return { server, jobs, batches, close };
  } catch (error) { await close(); throw error; }
}
