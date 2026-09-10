import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { root, hash, validateRequest } from './dist/config.js';
import { openJobs } from './workflow.mjs';

const corpus = JSON.parse(await readFile(new URL('./sound-cases.json', import.meta.url)));
const ids = new Set();
for (const entry of corpus.cases) {
  if (!validateRequest(entry.request) || !entry.expected || ids.has(entry.id)) throw new Error('Invalid sound corpus');
  ids.add(entry.id);
}
const args = process.argv.slice(2);
if (args.some(arg => !['--run', '--retry-failed', '--smoke'].includes(arg))) throw new Error('Usage: node sound-cases.mjs [--run [--retry-failed]] [--smoke]');
if (args.includes('--retry-failed') && !args.includes('--run')) throw new Error('--retry-failed requires --run');
const selected = args.includes('--smoke') ? corpus.cases.filter(c => c.request.prompt === 'dog barking' || /wood.*knock/i.test(c.request.prompt)) : corpus.cases;
console.log(JSON.stringify({ cases: selected.length, seconds: selected.reduce((sum, c) => sum + c.request.duration_seconds, 0),
  mode: args.includes('--run') ? 'paid ElevenLabs API generations' : 'inventory only; add --run to generate' }));
if (args.includes('--run')) {
  const workspace = join(root, '.runtime/elevenlabs-sound-cases');
  await mkdir(workspace, { recursive: true });
  const jobs = await openJobs({ root: workspace, token: randomBytes(32).toString('hex'), computePort: 0 });
  const stop = () => { void jobs.close(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const results = [];
  try {
    for (const entry of selected) {
      const key = `elevenlabs-corpus-v1-${hash(JSON.stringify(entry.request)).slice(0, 32)}`;
      let job = jobs.get(hash(key).slice(0, 32)) ?? await jobs.submit(key, { request: entry.request, provider: 'elevenlabs' });
      while (job.resumed_by && jobs.get(job.resumed_by)) job = jobs.get(job.resumed_by);
      if (args.includes('--retry-failed') && job.status === 'failed')
        job = await jobs.resume(job.id, `explicit-retry-${job.id}`);
      await jobs.wait();
      results.push({ ...entry, job_id: job.id, status: job.status, audio: job.result?.audio,
        candidate_sha256: job.result?.candidate_sha256, error: job.error, listening: 'unreviewed' });
      await writeFile(join(workspace, 'results.json'), JSON.stringify(results, null, 2));
      const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      await writeFile(join(workspace, 'listen.html'), `<!doctype html><meta charset="utf-8"><title>ElevenLabs sound cases</title>
        <style>body{max-width:800px;margin:40px auto;padding:20px;font:16px system-ui}article{border-top:1px solid #ccc;padding:20px 0}audio{width:100%}pre{white-space:pre-wrap}</style>
        <h1>ElevenLabs sound cases</h1><p>Original prompts, one generation each. Semantic quality awaits human listening.</p>
        ${results.map(r => `<article><h2>${escape(r.request.prompt)}</h2><p>${escape(r.expected)}</p><p>${r.request.duration_seconds}s · ${escape(r.status)}</p>${r.audio ? `<audio controls src="${escape(relative(workspace, r.audio))}"></audio>` : `<pre>${escape(r.error ?? '')}</pre>`}</article>`).join('')}`);
      console.log(JSON.stringify({ case: entry.id, status: job.status, audio: job.result?.audio }));
      if (job.status !== 'completed') throw new Error(`Case ${entry.id} stopped; inspect saved job. No failed or uncertain request is automatically retried.`);
    }
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
    await jobs.close();
  }
}
