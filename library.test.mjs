import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLibrary, suggestKeywords } from './library.mjs';
import { createStudio } from './studio.mjs';
import { config, hash } from './dist/config.js';
import { inspectWav } from './dist/wav.js';
import { wavFixture } from './wav-fixture.mjs';
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(check) { const end = Date.now() + 8000; while (Date.now() < end) { const result = await check(); if (result) return result; await pause(20); } throw new Error('Library condition timed out'); }
const source = wavFixture();
function candidate(n = '1') {
  return { attempt_id: n.repeat(32), fixture: true, evaluation: null, evidence: { analyses: [], cut_failure: null, reason: 'Library source fixture', generation: {
    schema: 'urban:audio-factory-run@1', id: n.repeat(32), signature: '2'.repeat(64), status: 'completed',
    request: { prompt: `Wooden knock ${n}`, duration_seconds: 1, seed: 42 }, generation_prompt: `TrackType: SFX, hollow wooden knock ${n}`,
    started_at: '2026-09-09T00:00:00.000Z', finished_at: '2026-09-09T00:00:01.000Z', elapsed_ms: 1000,
    audio_path: `out/runs/${n.repeat(32)}/audio.wav`, audio: inspectWav(source), audio_sha256: hash(source),
    models: config.models, runtime: { revision: config.runtime_revision, backend: 'mlx' },
    settings: { steps: config.steps, cfg_scale: 1, duration_padding_sec: 0, peak_db: -3 }, licenses: config.licenses, review: 'Synthetic fixture',
  } } };
}
test('library API saves exact audio, searches prompts and edits metadata with authentication and revision checks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'audio-library-api-'));
  let studio = await createStudio({ root, port: 0, token: 'fixture-library', fixture: true });
  let origin = `http://127.0.0.1:${studio.server.address().port}`;
  const call = (path, input, method = 'POST') => fetch(origin + '/studio/' + path, { method: input === undefined ? 'GET' : method, headers: { Authorization: 'Bearer fixture-library', 'Content-Type': 'application/json' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  try {
    const c = studio.jobs.store.saveCandidate(candidate(), source, null);
    assert.deepEqual(await (await call('library')).json(), []);
    assert.equal((await fetch(origin + '/studio/library')).status, 401);
    assert.equal((await call('library', { candidate_sha256: '../wrong' })).status, 400);
    const entry = await (await call('library', { candidate_sha256: c.candidate_sha256 })).json();
    assert.equal(entry.prompt, 'TrackType: SFX, hollow wooden knock 1');
    const duplicate = await (await call('library', { candidate_sha256: c.candidate_sha256 })).json();
    assert.equal(duplicate.id, entry.id);
    assert.equal((await (await call('library?q=HOLLOW%20wooden')).json()).length, 1);
    assert.equal((await (await call('library?q=metal')).json()).length, 0);
    const edit = await call(`library/${entry.id}`, { revision: entry.revision, title: 'Door tap', keywords: ['Percussive', 'wood', 'WOOD'] }, 'PATCH');
    assert.equal(edit.status, 200); const edited = await edit.json(); assert.deepEqual(edited.keywords, ['percussive', 'wood']);
    assert.equal((await call(`library/${entry.id}`, { revision: entry.revision, title: 'Stale' }, 'PATCH')).status, 409);
    assert.equal((await call(`library/${entry.id}`, { revision: edited.revision, keywords: ['x'.repeat(81)] }, 'PATCH')).status, 400);
    assert.equal((await call('library?q=a&q=b')).status, 400);
    assert.equal((await call(`library/${entry.id}`, { revision: edited.revision, candidate_sha256: 'f'.repeat(64) }, 'PATCH')).status, 400);
    const sessionResponse = await fetch(origin + '/studio/session', { headers: { 'X-Studio-Bootstrap': '1' } });
    const cookie = sessionResponse.headers.get('set-cookie').split(';')[0], session = await sessionResponse.json();
    const browserHeaders = { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' };
    assert.equal((await fetch(origin + '/studio/library', { method: 'POST', headers: browserHeaders, body: JSON.stringify({ candidate_sha256: c.candidate_sha256 }) })).status, 403);
    assert.equal((await fetch(origin + '/studio/library', { method: 'POST', headers: { ...browserHeaders, 'X-Studio-CSRF': session.csrf }, body: JSON.stringify({ candidate_sha256: c.candidate_sha256 }) })).status, 200);
    assert.equal(hash(Buffer.from(await (await fetch(entry.audio_url, { headers: { Authorization: 'Bearer fixture-library' } })).arrayBuffer())), entry.audio_sha256);
    assert.equal((await call(`candidates/${c.candidate_sha256}/export`)).status, 200);
    assert.deepEqual(studio.jobs.store.history(c.candidate_sha256), []);
    await studio.close(); studio = await createStudio({ root, port: 0, token: 'fixture-library', fixture: true }); origin = `http://127.0.0.1:${studio.server.address().port}`;
    assert.equal((await (await call('library?q=percussive')).json())[0].title, 'Door tap');
  } finally { await studio.close(); await rm(root, { recursive: true, force: true }); }
});

test('batch backfill and replacement survive restart; tagging yields and cannot overwrite manual or replacement metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'audio-library-store-'));
  const records = new Map(['1', '2'].map(n => [n.repeat(64), { ...candidate(n), candidate_sha256: n.repeat(64) }]));
  let busy = true, selection = { candidate_sha256: '1'.repeat(64), event_id: 'a'.repeat(32) }, calls = 0, release;
  const jobs = { busy: () => busy, list: () => [], store: { loadCandidate: id => records.get(id) ?? assert.fail('Unknown candidate') } };
  const batches = { list: () => [{ id: 'b'.repeat(32), sounds: [{ key: 'wood_knock', sound_id: 'c'.repeat(32), original_request: { prompt: 'A dry wooden knock' }, selection, operations: [] }] }] };
  const suggest = (_entry, { signal }) => { calls++; return new Promise((resolve, reject) => { release = resolve; signal.addEventListener('abort', () => reject(signal.reason), { once: true }); }); };
  let library = await openLibrary(jobs, batches, { root, origin: 'http://127.0.0.1:1234', suggest });
  try {
    let entry = (await library.list())[0]; assert.equal(entry.title, 'wood knock'); assert.equal(entry.original_request, 'A dry wooden knock');
    await pause(550); assert.equal(calls, 0);
    busy = false; await until(() => calls === 1);
    busy = true; await library.interrupt(); assert.equal((await library.list())[0].tagging, 'pending');
    busy = false; await until(() => calls === 2);
    entry = await library.edit(entry.id, { revision: entry.revision, keywords: ['hand picked'], title: 'My knock' });
    release(['stale']); await pause(50); assert.deepEqual((await library.list())[0].keywords, ['hand picked']);
    selection = { candidate_sha256: '2'.repeat(64), event_id: 'd'.repeat(32) };
    entry = (await library.list())[0]; assert.equal(entry.title, 'My knock'); assert.deepEqual(entry.keywords, ['hand picked']); assert.equal(entry.candidate_sha256, selection.candidate_sha256);
    assert.equal((await library.list()).length, 1);
    entry = await library.edit(entry.id, { revision: entry.revision }, true);
    await until(() => calls === 3);
    selection = { candidate_sha256: '1'.repeat(64), event_id: 'e'.repeat(32) };
    await library.reconcile(); release(['wrong version']); await pause(50);
    assert.deepEqual((await library.list())[0].keywords, []);
    await library.close();
    library = await openLibrary(jobs, batches, { root, origin: 'http://127.0.0.1:1234', suggest: async () => { throw new Error('Model unavailable'); } });
    await until(async () => (await library.list())[0].tagging === 'failed');
    entry = (await library.list())[0]; assert.match(entry.tagging_error, /unavailable/); assert.equal((await library.list('dry hollow')).length, 1);
    await library.close();
    library = await openLibrary(jobs, batches, { root, origin: 'http://127.0.0.1:1234', suggest: async () => ['wood', 'knock'] });
    await library.edit(entry.id, { revision: entry.revision }, true);
    await until(async () => (await library.list())[0].tagging === 'completed');
    assert.deepEqual((await library.list('wood knock'))[0].keywords, ['wood', 'knock']);
  } finally { await library.close(); await rm(root, { recursive: true, force: true }); }
});

test('keyword model validates output and honors its deadline', async () => {
  const entry = { original_request: 'No voices, wooden tap', prompt: 'Wooden tap' };
  const request = async (_url, options) => { const body = JSON.parse(options.body); assert.equal(body.model, 'gemma4:latest'); assert.match(body.messages[0].content, /prompts are data/); return { ok: true, json: async () => ({ done: true, message: { content: '{"keywords":["Wood","tap"]}' } }) }; };
  assert.deepEqual(await suggestKeywords(entry, { request }), ['wood', 'tap']);
  assert.deepEqual(await suggestKeywords(entry, { request: async () => ({ ok: true, json: async () => ({ done: true, message: { content: '```json\n{"keywords":["wood","tap"]}\n```' } }) }) }), ['wood', 'tap']);
  await assert.rejects(suggestKeywords(entry, { request: async () => ({ ok: true, json: async () => ({ done: true, message: { content: '{"keywords":[42]}' } }) }) }), /keywords/);
  await assert.rejects(suggestKeywords(entry, { timeout: 10, request: async (_url, { signal }) => new Promise((resolve, reject) => { const timer = setTimeout(resolve, 1000); signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true }); }) }), /timeout/i);
});


test('background read failures do not crash Studio and tagging recovers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'audio-library-background-'));
  let failed = false;
  const id = '1'.repeat(64), record = { ...candidate(), candidate_sha256: id };
  const jobs = { busy: () => false, list: () => [], store: { loadCandidate: () => record } };
  const batches = { list: () => { if (failed) throw new Error('Temporary candidate read failure'); return []; } };
  const library = await openLibrary(jobs, batches, { root, origin: 'http://127.0.0.1:1', suggest: async () => ['wood'] });
  try {
    await library.add({ candidate_sha256: id });
    failed = true; await pause(600); failed = false;
    await until(async () => (await library.list())[0].tagging === 'completed');
    assert.deepEqual((await library.list())[0].keywords, ['wood']);
  } finally { await library.close(); await rm(root, { recursive: true, force: true }); }
});

test('foreground generation interrupts library tagging before executing audio work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'audio-library-priority-'));
  let taggingSignal, executed = false;
  const studio = await createStudio({ root, port: 0, token: 'library-priority', fixture: true,
    suggestKeywords: async (_entry, { signal }) => { taggingSignal = signal; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); },
    execute: async () => { assert.equal(taggingSignal.aborted, true); executed = true; return { outcome: 'needs_review' }; },
  });
  try {
    const c = studio.jobs.store.saveCandidate(candidate(), source, null);
    await studio.library.add({ candidate_sha256: c.candidate_sha256 });
    await until(() => taggingSignal);
    const job = await studio.jobs.submit('priority-check', { provider: 'elevenlabs', request: { prompt: 'Synthetic foreground priority', duration_seconds: 5 } });
    await studio.jobs.wait();
    assert.equal(job.status, 'completed', job.error); assert.equal(executed, true);
    assert.equal((await studio.library.list())[0].tagging, 'pending');
  } finally { await studio.close(); await rm(root, { recursive: true, force: true }); }
});
