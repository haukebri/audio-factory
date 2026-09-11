// Run only against scripts/studio-ui-fixture.mjs. All mutations stay in its synthetic root.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const manifest = JSON.parse(readFileSync('.test-artifacts/studio-ui-session.json'));
assert.ok(manifest.root.startsWith(resolve('.runtime/studio-ui-')));
assert.match(manifest.url, /^http:\/\/127\.0\.0\.1:\d+$/);
const session = 'batch-ux-' + randomUUID();
const downloads = resolve('.test-artifacts', session); mkdirSync(downloads, { recursive: true });
const run = (...args) => {
  const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--download-path', downloads, '--json', ...args], {
    encoding: 'utf8', timeout: 65000, env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '60000' },
  }));
  assert.ok(result.success, result.error); return result.data;
};
const evaluate = code => run('eval', code).result;
const wait = code => run('wait', '--fn', code);
const click = (scope, label) => {
  evaluate(`(() => { document.querySelector('[data-check-click]')?.removeAttribute('data-check-click'); const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find(e => e.textContent.trim() === ${JSON.stringify(label)}); if (!b) throw Error('Missing button: '+${JSON.stringify(label)}); b.dataset.checkClick = ''; })()`);
  run('click', '[data-check-click]');
};
const request = async (path, value) => {
  const response = await fetch(manifest.url + '/studio/' + path, { headers: { Connection: 'close', Authorization: 'Bearer isolated-ui-fixture', 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, ...(value ? { method: 'POST', body: JSON.stringify(value) } : {}), signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `${path}: ${response.status}`); return response.json();
};
const evidence = { root: manifest.root, url: manifest.url, downloads, checks: [] };
const checked = name => { evidence.checks.push(name); appendFileSync('.test-artifacts/studio-batch-ux-history.jsonl', JSON.stringify({time:new Date().toISOString(), ...evidence}) + '\n'); writeFileSync('.test-artifacts/studio-batch-ux-results.json', JSON.stringify(evidence, null, 2)); console.log('Passed: ' + name); };
try {
  assert.equal((await request('readiness')).generation, 'fixture');
  assert.ok((await request('candidates')).every(c => c.fixture));
  const batch = await request('batches', { name: 'Batch UX synthetic verification', sounds: [
    { key: 'street', prompt: 'Synthetic city street ambience', duration_seconds: 5 },
    { key: 'forest', prompt: 'Synthetic forest ambience', duration_seconds: 5 },
  ] });
  evidence.batchId = batch.id; checked('Created isolated synthetic batch');
  run('open', batch.review_url);
  wait(`document.querySelectorAll('#batch-results audio').length >= 5`);
  evaluate(`window.postCounts = {}; window.originalFetch = window.fetch; window.fetch = async (...args) => { if (args[1]?.method === 'POST') { const p = String(args[0]).split('/').at(-1); postCounts[p] = (postCounts[p] || 0) + 1; } return originalFetch(...args); };`);
  // More checks follow the real clip/editor selectors; no browser state is used to manufacture candidates.
  const firstState = await request('batches/' + batch.id);
  const firstJob = await request('jobs/' + firstState.sounds[0].operations[0].job_id);
  const original = firstJob.variants[1].result.candidate_sha256;
  const row = id => `#batch-results [data-clip="${id}"]`;
  click(row(original) + ' button', 'Trim');
  wait(`document.querySelectorAll('.trim-editor input[type=range]').length === 2`);
  evaluate(`window.preview = document.querySelector('.trim-editor audio'); window.trimStart = document.querySelector('.trim-editor input[type=range]'); window.trimEnd = document.querySelectorAll('.trim-editor input[type=range]')[1]; trimStart.value = '.21'; trimStart.dispatchEvent(new Event('input', {bubbles:true})); trimEnd.value = '2.41'; trimEnd.dispatchEvent(new Event('input', {bubbles:true}));`);
  for (let i = 0; i < 2; i++) {
    click('.trim-editor button', 'Replay selection');
    wait(`!preview.paused && preview.currentTime >= .21`);
    assert.ok(evaluate(`preview.currentTime < 1`), 'Replay restarts at draft start');
    click('.trim-editor button', 'Pause');
    assert.equal(evaluate('preview.paused'), true);
    wait(`[...document.querySelectorAll('.trim-editor button')].some(b => b.textContent === 'Replay selection' && !b.disabled)`);
  }
  evaluate(`trimEnd.value = '.61'; trimEnd.dispatchEvent(new Event('input', {bubbles:true}));`);
  click('.trim-editor button', 'Replay selection');
  wait(`preview.paused && preview.currentTime >= .6`);
  assert.ok(evaluate('preview.currentTime < .8'), 'Preview stops at draft end');
  evaluate(`trimEnd.value = '2.41'; trimEnd.dispatchEvent(new Event('input', {bubbles:true}));`);
  assert.equal(evaluate('(postCounts.cut || 0) + (postCounts.select || 0)'), 0);
  // Sliders remain native keyboard controls and a refresh keeps draft/focus/player identity.
  evaluate('trimStart.focus()'); run('press', 'ArrowRight');
  assert.equal(evaluate('Number(trimStart.value)'), .22);
  evaluate(`trimStart.value = '.21'; trimStart.dispatchEvent(new Event('input', {bubbles:true}));`);
  evaluate(`(async () => { await refresh(); return true; })()`);
  assert.equal(evaluate(`document.activeElement === trimStart && preview === document.querySelector('.trim-editor audio') && trimStart.value === '0.21'`), true);
  // A rejected media promise reports at Replay and never becomes an unhandled rejection.
  evaluate(`window.testErrors = []; window.addEventListener('unhandledrejection', e => testErrors.push(String(e.reason))); window.realPlay = preview.play; preview.play = () => Promise.reject(new Error('Synthetic playback failure'));`);
  click('.trim-editor button', 'Replay selection');
  wait(`document.querySelector('.trim-editor').textContent.includes('Synthetic playback failure')`);
  assert.deepEqual(evaluate('testErrors'), []); evaluate('preview.play = realPlay');
  const sibling = firstJob.variants[0].result.candidate_sha256;
  click(row(sibling) + ' button', 'Replay');
  wait(`!document.querySelector('.trim-editor')`);
  assert.equal(evaluate('preview.paused'), true);
  click(row(original) + ' button', 'Trim');
  assert.equal(evaluate(`document.querySelector('#cut-start').value`), '0.21');
  evaluate(`window.preview = document.querySelector('.trim-editor audio'); window.trimStart = document.querySelector('#cut-start'); window.trimEnd = document.querySelector('#cut-end'); document.querySelectorAll('audio').forEach(p=>p.pause());`);
  checked('Draft source replay, pause, keyboard sliders and refresh preservation; zero implicit saves');
  wait(`batchReviews.find(b => b.id === '${batch.id}')?.sounds.every(s => s.operations.every(o => o.status === 'completed'))`);
  evaluate(`window.beforeCutFetch = window.fetch; window.fetch = async (...args) => { if (String(args[0]).endsWith('/cut') && args[1]?.method === 'POST') await new Promise(r => window.releaseCut = r); return beforeCutFetch(...args); };`);
  click('.trim-editor button', 'Save trim');
  evaluate(`trimStart.dispatchEvent(new Event('input', {bubbles:true}));`);
  assert.equal(evaluate(`[...document.querySelectorAll('.trim-editor button')].find(b=>b.textContent.includes('Saving')).disabled`), true);
  evaluate(`[...document.querySelectorAll('.trim-editor button')].find(b=>b.textContent.includes('Saving')).click(); releaseCut(); window.fetch = beforeCutFetch;`);
  wait(`document.querySelector('.trim-editor')?.textContent.includes('Trim saved') || document.querySelector('#batch-results').textContent.includes('Trim saved')`);
  const afterCut = await request('candidates');
  // Candidate membership is determined by immutable original generation identity, not row order.
  const source = await request('candidates/' + original);
  const saved = afterCut.find(c => c.evidence.generation.id === source.evidence.generation.id && c.evidence.cut?.bounds.start_sample === .21 * 44100 && c.evidence.cut?.bounds.end_sample === 2.41 * 44100);
  assert.equal(evaluate('postCounts.cut'), 1);
  assert.ok(saved); const chosen = saved.candidate_sha256; evidence.chosen = chosen; checked('Saved isolated trim version');
  assert.ok(!(await request('selections')).some(s => s.sound_id === firstState.sounds[0].sound_id));
  // Hold acknowledgement so native repeated clicks must submit once and show pending feedback.
  evaluate(`window.countedFetch = window.fetch; window.fetch = async (...args) => { if (String(args[0]).endsWith('/select') && args[1]?.method === 'POST') await new Promise(r => window.releaseSelection = r); return countedFetch(...args); };`);
  click(row(chosen) + ' button', 'Use this take');
  assert.equal(evaluate(`document.querySelector(${JSON.stringify(row(chosen))}).textContent.includes('Selecting')`), true);
  wait(`typeof window.releaseSelection === 'function'`);
  evaluate(`document.querySelector(${JSON.stringify(row(chosen))}).querySelector('button[disabled]').click(); releaseSelection(); window.fetch = countedFetch;`);
  wait(`document.querySelector(${JSON.stringify(row(chosen))})?.querySelector('[data-selected]:not([hidden])') && !document.querySelector(${JSON.stringify(row(chosen))})?.querySelector('[data-choose][aria-busy]')`);
  assert.equal(evaluate('postCounts.select'), 1);
  checked('Trim saves one exact version without selecting; delayed double-click selects once');
  // A rejected request must preserve the confirmed previous winner and provide a local error.
  evaluate(`window.fetch = async (...args) => String(args[0]).endsWith('/select') && args[1]?.method === 'POST' ? new Response(JSON.stringify({error:'Synthetic selection failure; retry'}), {status:409}) : countedFetch(...args);`);
  click(row(firstJob.variants[0].result.candidate_sha256) + ' button', 'Use this take');
  wait(`document.querySelector(${JSON.stringify(row(firstJob.variants[0].result.candidate_sha256))})?.textContent.includes('Synthetic selection failure')`);
  assert.equal((await request('selections')).find(s => s.sound_id === firstState.sounds[0].sound_id).candidate_sha256, chosen);
  evaluate('window.fetch = countedFetch');
  checked('Failed selection retains previous winner and shows adjacent actionable error');
  // A second request retains the first winner and stable numbering through reload.
  click('#batch-generate-more', 'Generate more');
  wait(`document.querySelectorAll('[data-generation]').length === 2`);
  wait(`document.querySelector('#batch-results').textContent.includes('Clip 10')`);
  const identities = evaluate(`[...document.querySelectorAll('[data-generation]')].map(g => ({id:g.dataset.generation, title:g.querySelector('summary').textContent}))`);
  assert.match(identities[0].title, /Generation 2/); assert.match(identities[1].title, /Generation 1/);
  assert.equal(evaluate(`document.querySelectorAll('[data-generation]')[1].open`), false);
  assert.equal(evaluate(`document.querySelector(${JSON.stringify(row(chosen))}).getClientRects().length > 0`), true);
  run('click', '[data-generation]:last-of-type > summary');
  evaluate(`(async () => { await refresh(); })()`);
  assert.equal(evaluate(`document.querySelectorAll('[data-generation]')[1].open`), true);
  run('reload'); wait(`document.querySelector('#batch-results')?.textContent.includes('Clip 10')`);
  assert.deepEqual(evaluate(`[...document.querySelectorAll('[data-generation]')].map(g => ({id:g.dataset.generation, title:g.querySelector('summary').textContent}))`), identities);
  checked('Two generation groups preserve clip numbering, winner, ordering and disclosure across refresh/reload');
  // Start other-sound work before recreating the selected sound; only the synthetic backend runs.
  await request(`batches/${batch.id}/sounds/forest/regenerate`, { prompt: 'Synthetic forest ambience again', duration_seconds: 5 });
  evaluate(`document.querySelector(${JSON.stringify(row(chosen))}).querySelector('.clip-secondary').open = true`);
  click(row(chosen) + ' button', 'Generate with ElevenLabs');
  evaluate(`[...document.querySelectorAll(${JSON.stringify(row(chosen) + ' button')})].filter(b=>b.textContent==='Generate with ElevenLabs').forEach(b=>b.click());`);
  wait(`document.querySelector('#batch-results').textContent.includes('Queued') && document.querySelector('#batch-results').textContent.includes('ElevenLabs')`);
  const queued = await request('batches/' + batch.id);
  assert.equal(queued.sounds[0].operations.length, 3);
  assert.equal((await request('selections')).find(s => s.sound_id === firstState.sounds[0].sound_id).candidate_sha256, chosen);
  checked('ElevenLabs queued behind another sound appears immediately without changing winner');
  wait(`document.querySelector('#batch-results').textContent.includes('Generating')`);
  wait(`document.querySelector('#batch-results').textContent.includes('Clip 11') && jobs.some(j => j.provider === 'elevenlabs' && j.status === 'completed')`);
  const ready = await request('batches/' + batch.id);
  const eleven = await request('jobs/' + ready.sounds[0].operations.at(-1).job_id);
  assert.equal(eleven.status, 'completed'); assert.equal(eleven.variants.length, 1);
  click(row(eleven.result.candidate_sha256) + ' button', 'Replay');
  wait(`!document.querySelector(${JSON.stringify(row(eleven.result.candidate_sha256))}).querySelector('audio').paused`);
  checked('Queued ElevenLabs group transitions to generating and playable ready clip');
  // Switching sounds stops playback and discards only the visible editor, not saved audio.
  click(row(chosen) + ' button', 'Trim');
  click('#sound-list button', 'forest · Needs selection');
  wait(`document.querySelector('#sound-title').textContent.includes('forest')`);
  assert.equal(evaluate(`document.querySelectorAll('.trim-editor').length`), 0);
  assert.equal(evaluate(`[...document.querySelectorAll('audio')].some(p => !p.paused)`), false);
  click('#batch-results .clip-row button', 'Use this take');
  wait(`!document.querySelector('#batch-complete').hidden`);
  assert.equal(evaluate(`document.querySelector('#batch-next').hidden && document.querySelector('#batch-pause').hidden && !document.querySelector('#batch-export').hidden`), true);
  run('reload'); wait(`!document.querySelector('#batch-complete').hidden`);
  await request(`batches/${batch.id}/pause`, {}); checked('Paused completed synthetic batch to verify resume/export recovery');
  evaluate(`(async () => { await refresh(); })()`);
  assert.equal(evaluate(`document.querySelector('#batch-export').disabled && Boolean(document.querySelector('#batch-export').title)`), true);
  click('#batch-pause', 'Resume queued work');
  wait(`document.querySelector('#batch-pause').hidden && !document.querySelector('#batch-export').disabled`);
  checked('Resumed completed batch; export available and no pointless Pause');
  const winners = await request(`batches/${batch.id}/winners`);
  const winner = winners.sounds.find(s => s.key === 'street');
  assert.equal(winner.candidate_sha256, chosen);
  assert.equal(winner.audio_sha256, saved.evidence.cut.audio_sha256);
  const response = await fetch(winner.audio_url, { headers: { Connection: 'close', Authorization: 'Bearer isolated-ui-fixture' } });
  assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), winner.audio_sha256);
  click('#batch-export', 'Export winners');
  wait(`!document.querySelector('#batch-export').hasAttribute('aria-busy')`);
  const downloadedManifest = JSON.parse(readFileSync(resolve(downloads, 'winners.json')));
  assert.deepEqual(downloadedManifest, winners);
  const archive = readdirSync(downloads).find(n => n.includes(chosen.slice(0, 8)) && n.endsWith('.tar'));
  assert.ok(archive, 'Export downloads the exact selected trim archive');
  const audioBytes = execFileSync('tar', ['-xOf', resolve(downloads, archive), `${saved.evidence.cut.id}.wav`]);
  assert.equal(createHash('sha256').update(audioBytes).digest('hex'), winner.audio_sha256);
  checked('Last selection, reload, completion controls, exported winner and exact downloaded WAV hash');
  for (const width of [1280, 375]) {
    run('set', 'viewport', String(width), '900');
    assert.equal(evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `No horizontal overflow at ${width}px`);
    assert.equal(evaluate(`[...document.querySelectorAll('button,summary')].filter(e=>e.getClientRects().length).some(e=>/^(Compare|Approve|Reject)/.test(e.textContent))`), false);
    { const shot = run('screenshot', '--full'); if (shot.path) copyFileSync(shot.path, `.test-artifacts/studio-batch-ux-${width}.png`); }
  }
  checked('Desktop/narrow layout and no competing approval/comparison controls');
  Object.assign(evidence, { winners, generationGroups: identities });
  writeFileSync('.test-artifacts/studio-batch-ux-results.json', JSON.stringify(evidence, null, 2));
} catch (error) { console.error(JSON.stringify(evaluate(`({text:document.body.innerText, errors:window.testErrors || []})`))); { const shot = run('screenshot', '--full'); if (shot.path) copyFileSync(shot.path, '.test-artifacts/studio-batch-ux-failure.png'); } throw error; } finally { run('close'); }
