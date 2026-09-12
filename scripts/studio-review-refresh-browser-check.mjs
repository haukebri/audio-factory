// Run against scripts/studio-ui-fixture.mjs only; no model or paid requests.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const manifest = JSON.parse(readFileSync('.test-artifacts/studio-ui-session.json'));
assert.ok(manifest.root.includes('/.runtime/studio-ui-'));
const run = (...args) => {
  const result = JSON.parse(execFileSync('agent-browser', ['--session', 'review-refresh', '--json', ...args], { encoding: 'utf8', timeout: 60000 }));
  assert.ok(result.success, result.error);
  return result.data;
};
const evaluate = code => run('eval', code).result;
const request = async (path, value) => {
  const response = await fetch(manifest.url + '/studio/' + path, {
    method: value ? 'POST' : 'GET', headers: { Authorization: 'Bearer isolated-ui-fixture', 'Content-Type': 'application/json' },
    ...(value ? { body: JSON.stringify(value) } : {}),
  });
  assert.equal(response.status, 200);
  return response.json();
};
const externalReview = async (id, verdict) => {
  const history = await request(`candidates/${id}/feedback`);
  return request(`candidates/${id}/feedback`, { candidate_sha256: id, event_id: randomUUID().replaceAll('-', ''),
    supersedes: history.at(-1)?.event_id ?? null, actor: 'human', verdict, reason_tags: verdict === 'rejected' ? ['other'] : [], note: 'Other tab' });
};
try {
  assert.equal((await request('readiness')).generation, 'fixture');
  const before = await request('candidates');
  assert.ok(before.length && before.every(c => c.fixture));
  run('open', manifest.url);
  run('wait', '--fn', 'Boolean(csrf) && !busy');
  const id = evaluate(`(async () => { await select(preferred(takes[0]).candidate_sha256); navigate('listen'); return selected; })()`);
  run('wait', '--fn', `document.querySelector('#candidate audio').readyState > 0`);
  run('find', 'role', 'button', 'click', '--name', 'Play take', '--exact');
  for (const width of [1280, 375]) {
    run('set', 'viewport', String(width), '844');
    await externalReview(id, 'rejected');
    evaluate(`(async () => { await connect(); navigate('listen'); openCompare('sound'); navigate('listen');
      window.savedPlayer = document.querySelector('#candidate audio'); savedPlayer.loop = true; savedPlayer.currentTime = 0.2; await savedPlayer.play();
      window.savedNote = $('listen-note'); savedNote.closest('details').open = true; savedNote.value = 'Unsaved local note'; savedNote.dispatchEvent(new Event('input', {bubbles:true})); savedNote.focus();
      $('cut-start').value = '0.12'; $('cut-start').dispatchEvent(new Event('input', {bubbles:true}));
      $('human-filter').value = 'accepted'; renderHistory(); })()`);
    await externalReview(id, 'accepted');
    assert.deepEqual(await request('candidates'), before, 'feedback does not change candidate JSON');
    const refreshed = evaluate(`(async () => { window.dispatchEvent(new Event('focus')); await pendingAction;
      return { statuses: [...document.querySelectorAll('[data-human]')].filter(e => e.dataset.human === selected).map(e => e.textContent),
        library: $('history-list').textContent, samePlayer: savedPlayer === document.querySelector('#candidate audio'), playing: !savedPlayer.paused,
        sameNote: savedNote === $('listen-note'), note: savedNote.value, focus: document.activeElement === savedNote, trim: $('cut-start').value }; })()`);
    assert.ok(refreshed.statuses.length >= 2);
    assert.ok(refreshed.statuses.every(s => s === 'Human: Approved · Other tab'));
    assert.match(refreshed.library, /Human: Approved/);
    assert.deepEqual([refreshed.samePlayer, refreshed.playing, refreshed.sameNote, refreshed.focus], [true, true, true, true]);
    assert.equal(refreshed.note, 'Unsaved local note'); assert.equal(refreshed.trim, '0.12');
    assert.match(evaluate(`document.querySelector('[aria-label="Exact evidence record"]').selectedOptions[0].textContent`), /Human: Approved/);
    // An external writer races the next save without a focus event.
    const latest = await externalReview(id, 'rejected');
    const conflict = evaluate(`(async () => { [...$('candidate').querySelectorAll('button')].find(b => b.textContent === 'Approve').click(); await pendingAction;
      return { human: humanText(selected), error: $('candidate').querySelector('[role="alert"]').textContent, note: savedNote.value,
        playing: !savedPlayer.paused, samePlayer: savedPlayer === document.querySelector('#candidate audio') }; })()`);
    assert.equal((await request(`candidates/${id}/feedback`)).at(-1).event_id, latest.event_id, 'conflict must not automatically overwrite another review');
    assert.equal(conflict.human, 'Human: Rejected · Other tab'); assert.match(conflict.error, /latest review.*again/i);
    assert.equal(conflict.note, 'Unsaved local note'); assert.ok(conflict.playing && conflict.samePlayer);
    evaluate(`(async () => { [...$('candidate').querySelectorAll('button')].find(b => b.textContent === 'Approve').click(); await pendingAction; })()`);
    const retried = (await request(`candidates/${id}/feedback`)).at(-1);
    assert.equal(retried.supersedes, latest.event_id); assert.equal(retried.verdict, 'accepted'); assert.equal(retried.note, 'Unsaved local note');
    await externalReview(id, 'rejected');
    assert.equal(evaluate(`(async () => { await select(selected); return humanText(selected); })()`), 'Human: Rejected · Other tab');
    await externalReview(id, 'accepted');
    assert.equal(evaluate(`(async () => { await connect(); return humanText(selected); })()`), 'Human: Approved · Other tab');
    assert.equal(evaluate(`savedPlayer === document.querySelector('#candidate audio') && savedNote === $('listen-note') && savedNote.value === 'Unsaved local note'`), true);
    const polls = evaluate(`(async () => { const original = fetch; let feedbackRequests = 0; fetch = (...args) => { if (String(args[0]).endsWith('/feedback')) feedbackRequests++; return original(...args); };
      try { await refresh(); await refresh(); return feedbackRequests; } finally { fetch = original; savedPlayer.pause(); } })()`);
    assert.equal(polls, 0, 'unchanged polling must not fan out feedback requests');
    evaluate(`(() => { navigate('history'); $('human-filter').value = 'all'; renderHistory();
      const target = [...$('history-list').querySelectorAll('button')].find(b => b.dataset.libraryFocus === selected);
      target.closest('details').open = true; target.focus(); })()`);
    await externalReview(id, 'rejected');
    assert.equal(evaluate(`(async () => { window.dispatchEvent(new Event('focus')); await pendingAction; return document.activeElement.dataset.libraryFocus; })()`), id);
    await externalReview(id, 'accepted');
    evaluate(`(async () => { window.dispatchEvent(new Event('focus')); await pendingAction;
      $('human-filter').value = 'accepted'; renderHistory(); $('history-list').querySelector('.library-item > button').focus(); })()`);
    await externalReview(id, 'rejected');
    assert.equal(evaluate(`(async () => { window.dispatchEvent(new Event('focus')); await pendingAction; return document.activeElement.id; })()`), 'human-filter', 'a filtered-out focused take returns focus to the filter');
    assert.match(evaluate(`$('history-list').textContent`), /No sounds match/);
    assert.equal(evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    console.log(`Passed review focus, conflict/retry, reopen, reconnect, player/draft preservation and polling at ${width}px`);
  }
} finally { run('close'); }
