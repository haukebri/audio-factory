// Run against scripts/studio-ui-fixture.mjs only; no model or paid requests.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('.test-artifacts/studio-ui-session.json'));
assert.ok(manifest.root.includes('/.runtime/studio-ui-'));
const run = (...args) => {
  const result = JSON.parse(execFileSync('agent-browser', ['--session', 'hidden-playback', '--json', ...args], { encoding: 'utf8', timeout: 60000 }));
  assert.ok(result.success, result.error);
  return result.data;
};
const evaluate = code => run('eval', code).result;
try {
  const ready = await fetch(manifest.url + '/studio/readiness', { headers: { Authorization: 'Bearer isolated-ui-fixture' } });
  assert.equal((await ready.json()).generation, 'fixture');
  run('open', manifest.url);
  run('wait', '--fn', 'Boolean(csrf) && !busy');
  assert.equal(evaluate('candidates.length > 0 && candidates.every(c => c.fixture)'), true);
  evaluate(`(async () => { await select(preferred(takes[0]).candidate_sha256); navigate('listen'); })()`);
  run('find', 'role', 'button', 'click', '--name', 'Play take', '--exact');
  // Add an earlier result to the browser's job snapshot, then use the real card renderer.
  // The synthetic fixture normally succeeds on its first attempt; nothing is persisted.
  evaluate(`(() => {
    const job = jobs.find(j => j.id === currentJob), variant = job.variants[0];
    const earlier = job.attempts.find(a => a.variant_index !== variant.index && a.result);
    job.attempts.push({...earlier, variant_index: variant.index}); renderBatch();
  })()`);
  // Hold the snapshot so background polls cannot remove the synthetic earlier attempt.
  evaluate('refresh = async () => {}');
  for (const width of [1280, 768, 767, 390, 375, 320]) {
    run('set', 'viewport', String(width), '844');
    for (const selector of ['#batch-results .variant-card > audio', '#batch-results details audio', '#candidate audio']) {
      for (const destination of ['listen', 'create', 'library', 'settings', 'compare']) {
        evaluate(`navigate('listen'); document.querySelectorAll('#batch-results details').forEach(d => d.open = true)`);
        run('wait', '--fn', `document.querySelector(${JSON.stringify(selector)}).readyState > 0`);
        const before = evaluate(`(async () => {
          window.testPlayer = document.querySelector(${JSON.stringify(selector)});
          testPlayer.loop = true; testPlayer.currentTime = 0.25; await testPlayer.play();
          return {playing: !testPlayer.paused, visible: testPlayer.getClientRects().length > 0};
        })()`);
        assert.deepEqual(before, { playing: true, visible: true });
        const after = evaluate(`(() => {
          if (${JSON.stringify(destination)} === 'compare') [...$('candidate').querySelectorAll('button')].find(b => b.textContent === 'Compare').click();
          else if (${JSON.stringify(destination)} === 'listen') navigate('listen');
          else document.querySelector('nav a[href="#${destination}"]').click();
          return pendingAction.then(() => ({paused: testPlayer.paused, visible: testPlayer.getClientRects().length > 0,
            samePlayer: document.querySelector(${JSON.stringify(selector)}) === testPlayer}));
        })()`);
        const visible = destination === 'listen' || destination === 'create' && width >= 768;
        assert.deepEqual(after, { paused: !visible, visible, samePlayer: true }, `${width}px ${selector} → ${destination}`);
        evaluate('testPlayer.pause()');
      }
    }
    evaluate(`openCompare('sound')`);
    run('wait', '--fn', `document.querySelector('#comparison-a audio').readyState > 0`);
    assert.equal(evaluate(`(async () => { const p = document.querySelector('#comparison-a audio'); p.loop = true; await p.play();
      if (p.paused) throw new Error('Comparison did not play'); document.querySelector('#compare-view > a').click(); return p.paused; })()`), true);
    console.log(`Passed primary variation, earlier attempt, detailed take, visible-workspace continuity and comparison exit at ${width}px`);
  }
} finally { run('close'); }
