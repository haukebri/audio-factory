// Run against scripts/studio-ui-fixture.mjs. Never touches the user's library.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const manifest = JSON.parse(readFileSync('.test-artifacts/studio-ui-session.json'));
assert.ok(manifest.root.startsWith(resolve('.runtime/studio-ui-')));
const session = 'library-' + randomUUID();
const run = (...args) => {
  const reply = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', timeout: 60000 }));
  assert.ok(reply.success, reply.error); return reply.data;
};
const evaluate = code => run('eval', code).result;
const wait = code => run('wait', '--fn', code);
const click = (scope, text) => evaluate(`[...document.querySelectorAll(${JSON.stringify(scope)})].find(b => b.textContent === ${JSON.stringify(text)}).click()`);
try {
  let batch;
  if (!process.argv.includes('--races-only')) {
  run('open', manifest.url + '/#history');
  wait("document.querySelector('#history-list button') && document.querySelector('#status').textContent.includes('Connected')");
  assert.ok(evaluate('candidates.every(c => c.fixture)'));
  evaluate("document.querySelector('#history-list button').click()");
  wait("document.querySelector('#batch-results [data-choose]')");
  click('#batch-results button', 'Use this take');
  wait("!document.querySelector('#library-offer').hidden");
  assert.equal(evaluate('libraryEntries.length'), 0, 'selection alone does not save a standalone sound');
  click('#library-offer button', 'Not now');
  assert.equal(evaluate("document.querySelector('#library-offer').hidden"), true);
  evaluate("document.querySelector('#batch-results .clip-secondary').open = true");
  click('#batch-results .clip-secondary button', 'Download');
  wait("!document.querySelector('#library-offer').hidden");
  click('#library-offer button', 'Add to library');
  wait('libraryEntries.length === 1');
  const id = evaluate('libraryEntries[0].candidate_sha256');
  evaluate("navigate('library')");
  wait("document.querySelector('#library article')");
  click('#library button', 'Edit details');
  run('fill', '#library form input', 'Pocket percussion');
  run('fill', '#library form textarea', 'wood, bright, short');
  click('#library form button', 'Save details');
  wait("!document.querySelector('#library form') && document.querySelector('#library h2').textContent === 'Pocket percussion'");
  run('fill', '#library-search', 'BRIGHT percussion');
  assert.equal(evaluate("document.querySelectorAll('#library article').length"), 1);
  run('fill', '#library-search', 'nothing-matches');
  assert.equal(evaluate("document.querySelectorAll('#library article').length"), 0);
  run('fill', '#library-search', 'Synthetic');
  assert.equal(evaluate("document.querySelectorAll('#library article').length"), 1, 'original prompt remains searchable after title edits');
  run('fill', '#library-search', '');
  evaluate("document.querySelector('#library audio').play()");
  wait("!document.querySelector('#library audio').paused");
  const playback = evaluate("(async () => { const p = document.querySelector('#library audio'); await refresh(); return p === document.querySelector('#library audio') && !p.paused; })()");
  assert.equal(playback, true, 'refresh preserves playing audio');
  evaluate("document.querySelector('#library audio').pause()");
  click('#library button', 'Edit details');
  run('fill', '#library form input', 'Unsaved draft');
  evaluate('(async () => { await refresh(); })()');
  assert.equal(evaluate("document.querySelector('#library form input').value"), 'Unsaved draft');
  click('#library form button', 'Cancel');
  run('reload'); wait("document.querySelector('#library h2')?.textContent === 'Pocket percussion'");
  assert.equal(evaluate('libraryEntries[0].candidate_sha256'), id);
  run('set', 'viewport', '390', '844');
  assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  run('screenshot', resolve('.test-artifacts/library-mobile.png'));
  run('set', 'viewport', '1280', '900');
  run('screenshot', resolve('.test-artifacts/library-desktop.png'));
  // Exercise the actual batch selection endpoint and the automatic library update.
  batch = evaluate("(async () => api('batches', { name: 'Library browser batch', sounds: [{ key: 'library_tap', prompt: 'Synthetic library tap', duration_seconds: 5 }] }, 'library-browser-batch'))()");
  wait(`batchReviews.find(b => b.id === '${batch.id}')?.status === 'awaiting_review'`);
  evaluate(`(async () => { navigate('batch/${batch.id}'); await openReviewSound('library_tap'); })()`);
  wait("document.querySelector('#batch-results [data-choose]')");
  click('#batch-results button', 'Use this take');
  wait(`libraryEntries.some(e => e.batch_id === '${batch.id}')`);
  const first = evaluate(`libraryEntries.find(e => e.batch_id === '${batch.id}').candidate_sha256`);
  assert.equal(evaluate("document.querySelector('#library-offer').hidden"), true);
  evaluate(`document.querySelector('#batch-results [data-clip]:not([data-clip="${first}"]) [data-choose]').click()`);
  wait(`libraryEntries.find(e => e.batch_id === '${batch.id}')?.candidate_sha256 !== '${first}'`);
  assert.equal(evaluate(`libraryEntries.filter(e => e.batch_id === '${batch.id}').length`), 1);
  assert.deepEqual(evaluate("[...document.querySelectorAll('#library [data-entry]')].map(e=>e.dataset.entry)"), evaluate('libraryEntries.map(e=>e.id)'));
  } else {
    run('open', manifest.url + '/#library'); wait('libraryEntries.some(e=>e.batch_id)');
    batch = evaluate('batchReviews.find(b=>libraryEntries.some(e=>e.batch_id===b.id))');
  }
  evaluate("navigate('library')"); run('click', '#library-search');
  // A second reviewer changes the winner while this card is being used.
  evaluate(`(async () => { navigate('library'); await refresh(); window.raceEntry = libraryEntries.find(e => e.batch_id === '${batch.id}'); window.raceRow = document.querySelector('[data-entry="'+raceEntry.id+'"]'); raceRow.querySelector('audio').loop = true; await raceRow.querySelector('audio').play(); raceRow.querySelector('button').focus(); })()`);
  evaluate(`(async () => { const next=takes.filter(t=>t.sound===raceEntry.sound_id).flatMap(t=>t.records).find(c=>c.evidence.generation.request.prompt!==raceEntry.prompt); await api('candidates/'+next.candidate_sha256+'/select',{event_id:uid(),supersedes:selections.find(s=>s.sound_id===raceEntry.sound_id).event_id}); await refresh(); })()`);
  assert.equal(evaluate("raceRow.querySelector('button').disabled"), true, 'stale winner download must be disabled');
  assert.match(evaluate('raceRow.textContent'), /previous version/i);
  assert.equal(evaluate("!raceRow.querySelector('audio').paused"), true, 'old audio keeps playing with an explicit warning');
  evaluate(`(async () => { raceRow.querySelector('audio').pause(); document.activeElement.blur(); await refresh(); raceEntry=libraryEntries.find(e=>e.id===raceEntry.id); raceRow=document.querySelector('[data-entry="'+raceEntry.id+'"]'); $('library-search').value=raceEntry.prompt.split(' ').slice(-2).join(' '); renderLibrary(); editLibrary(raceEntry,raceRow); raceRow.querySelector('form input').value='Keep my unsaved draft'; const next=takes.filter(t=>t.sound===raceEntry.sound_id).flatMap(t=>t.records).find(c=>!c.evidence.generation.request.prompt.includes($('library-search').value)); await api('candidates/'+next.candidate_sha256+'/select',{event_id:uid(),supersedes:selections.find(s=>s.sound_id===raceEntry.sound_id).event_id}); await refresh(); })()`);
  assert.equal(evaluate('raceRow.isConnected'), true, 'background search changes must preserve the editing card');
  assert.equal(evaluate("raceRow.querySelector('form input').value"), 'Keep my unsaved draft');
  assert.match(evaluate("$('library-count').textContent"), /draft/);
  evaluate("[...raceRow.querySelectorAll('form button')].find(b=>b.textContent==='Cancel').click()");
  assert.equal(evaluate('raceRow.isConnected'), false, 'cancel releases the draft that no longer matches search');
  console.log(process.argv.includes('--races-only') ? 'Library race checks passed: stale winner actions disabled, playing audio preserved, filtered drafts retained.' : 'Library browser checks passed: standalone consent, download, editing, prompt/keyword search, playback, restart, mobile layout, batch replacement and concurrent winner changes.');
} finally { run('close'); }
