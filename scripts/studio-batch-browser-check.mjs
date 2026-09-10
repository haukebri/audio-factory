// Run only against scripts/studio-ui-fixture.mjs; see docs/plans/studio-ui-verification.md.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const manifest = JSON.parse(readFileSync('.test-artifacts/studio-ui-session.json'));
assert.ok(manifest.root.startsWith(resolve('.runtime/studio-ui-')), 'Owned fixture root required');
assert.match(manifest.url, /^http:\/\/127\.0\.0\.1:\d+$/);
const session = 'batch-' + randomUUID();
const run = (...args) => {
  const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', timeout: 60000, env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '50000' },
  }));
  assert.ok(result.success, result.error);
  return result.data;
};
const evaluate = code => run('eval', code).result;
const click = (scope, text) => evaluate(`[...document.querySelectorAll(${JSON.stringify(scope)})].find(e => e.textContent === ${JSON.stringify(text)}).click()`);
const request = async (path, value) => {
  const response = await fetch(manifest.url + '/studio/' + path, {
    headers: { Connection: 'close', Authorization: 'Bearer isolated-ui-fixture', 'Content-Type': 'application/json', 'Idempotency-Key': session },
    ...(value ? { method: 'POST', body: JSON.stringify(value) } : {}), signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, value ? 202 : 200, `${path}: ${response.status}`);
  return response.json();
};
const evidence = { root: manifest.root, url: manifest.url };
try {
  assert.equal((await request('readiness')).generation, 'fixture');
  assert.ok((await request('candidates')).every(c => c.fixture));
  const batch = await request('batches', { name: 'Synthetic browser winner', sounds: [
    { key: 'tone', prompt: 'Synthetic review tone', duration_seconds: 5 },
  ] });
  evidence.batch = batch;
  writeFileSync('.test-artifacts/studio-batch-browser-results.json', JSON.stringify(evidence, null, 2));
  assert.equal(batch.review_url, manifest.url + '/#batch/' + batch.id);
  run('open', batch.review_url);
  run('wait', '--fn', `document.querySelectorAll('#batch-results .variant-card audio').length === 5 && document.querySelector('#batch-progress').textContent.includes('awaiting_review')`);
  assert.equal(evaluate(`document.querySelector('#batch-duration').value`), '5');
  const state = await request('batches/' + batch.id);
  const job = await request('jobs/' + state.sounds[0].operations[0].job_id);
  assert.equal(job.status, 'completed'); assert.equal(job.provider, 'local');
  assert.equal(job.attempts.length, 5); assert.equal(job.variants.length, 5);
  const cards = evaluate(`[...document.querySelectorAll('#batch-results .variant-card')].map(c => ({ title: c.querySelector('h4').textContent, src: c.querySelector('audio').getAttribute('src') }))`);
  assert.equal(cards.length, 5);
  for (const [i, card] of cards.entries()) {
    assert.equal(card.title, `Local variation ${i + 1}`);
    assert.equal(card.src, `/studio/candidates/${job.variants[i].result.candidate_sha256}/audio`);
  }
  run('snapshot', '-i');
  // Choose a non-default take, then a new trim: identical fixture tones cannot hide a wrong version.
  click('#batch-results .variant-card:nth-of-type(2) button', 'Open / trim / download');
  run('wait', '--fn', `document.querySelector('#version')?.value === '${job.variants[1].result.candidate_sha256}'`);
  click('#candidate summary', 'Trim');
  run('fill', '#cut-start', '0.21'); run('fill', '#cut-end', '2.41');
  click('#candidate button', 'Save version');
  run('wait', '--fn', `document.querySelector('#version')?.value && document.querySelector('#version').value !== '${job.variants[1].result.candidate_sha256}'`);
  const chosen = evaluate(`document.querySelector('#version').value`);
  const candidate = await request('candidates/' + chosen);
  assert.equal(candidate.fixture, true);
  assert.equal(candidate.evidence.cut.bounds.start_sample, 0.21 * 44100);
  assert.equal(candidate.evidence.cut.bounds.end_sample, 2.41 * 44100);
  const prepared = await request('candidates/' + job.variants[1].result.candidate_sha256);
  assert.equal(candidate.evidence.generation.id, prepared.evidence.generation.id);
  assert.notEqual(candidate.evidence.cut.audio_sha256, prepared.evidence.cut.audio_sha256);
  // Lose only the acknowledgement, after the real server has committed the selection.
  evaluate(`(() => { const original = window.fetch; window.lostSelectionResponse = false;
    window.fetch = async (...args) => { const response = await original(...args);
      if (String(args[0]).endsWith('/select') && args[1]?.method === 'POST') {
        window.fetch = original; if (!response.ok) throw new Error('Selection was not accepted');
        await response.json(); window.lostSelectionResponse = true; throw new TypeError('Controlled lost selection response');
      } return response;
    }; })()`);
  click('#candidate button', 'Use this take');
  run('wait', '--fn', `window.lostSelectionResponse && !document.querySelector('#reconnect').hidden`);
  const pendingKey = 'studio-selection-' + state.sounds[0].sound_id;
  assert.equal(evaluate(`JSON.parse(localStorage.getItem('${pendingKey}')).id`), chosen);
  const history = await request(`candidates/${chosen}/selection-history`);
  assert.equal(history.length, 1); assert.equal(history[0].candidate_sha256, chosen);
  // Remove browsing preferences so reload must recover the server's durable winner.
  evaluate(`Object.keys(localStorage).filter(k => k === 'studio-selected' || k.startsWith('studio-version-')).forEach(k => localStorage.removeItem(k))`);
  run('reload');
  run('wait', '--fn', `document.querySelector('#version')?.value === '${chosen}' && document.querySelector('#batch-progress').textContent.includes('ready')`);
  assert.equal(evaluate('location.hash'), '#batch/' + batch.id);
  run('snapshot', '-i');
  click('#candidate button', 'Use this take');
  run('wait', '--fn', `localStorage.getItem('${pendingKey}') === null`);
  assert.deepEqual(await request(`candidates/${chosen}/selection-history`), history, 'Recovery must reuse the one committed selection');
  const winners = await request(`batches/${batch.id}/winners`);
  assert.equal(winners.sounds.length, 1);
  const winner = winners.sounds[0];
  assert.equal(winner.candidate_sha256, chosen, 'Winner must bind the exact version chosen in the browser');
  assert.equal(winner.audio_sha256, candidate.evidence.cut.audio_sha256, 'Winner must bind the chosen trim audio');
  assert.equal(winner.key, 'tone'); assert.equal(winner.selection_event_id, history[0].event_id);
  assert.equal(winner.requested_duration_seconds, 5); assert.equal(winner.duration_seconds, 2.2);
  assert.equal(winner.audio_url, `${manifest.url}/studio/candidates/${chosen}/audio`);
  const audio = await fetch(winner.audio_url, { headers: { Authorization: 'Bearer isolated-ui-fixture' } });
  assert.equal(audio.status, 200);
  assert.equal(createHash('sha256').update(Buffer.from(await audio.arrayBuffer())).digest('hex'), winner.audio_sha256);
  assert.equal((await request('jobs/' + job.id)).attempts.length, 5, 'Trim, recovery and reload must not regenerate');
  Object.assign(evidence, { cards, chosen, winners, selectionHistory: history });
  writeFileSync('.test-artifacts/studio-batch-browser-results.json', JSON.stringify(evidence, null, 2));
  console.log('Passed batch deep link, five local cards, exact trim, lost-response recovery, persisted reload and downloaded winner hash.');
} finally { run('close'); }
