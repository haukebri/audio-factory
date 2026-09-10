import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
new vm.Script(readFileSync(new URL('./studio.js', import.meta.url), 'utf8'));

import test from 'node:test';

test('user actions wait for background work instead of disappearing', async () => {
  const source = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  const context = vm.createContext({ setTimeout });
  vm.runInContext(`let busy = false, pendingAction = Promise.resolve(); const say = () => {}; ${source.slice(source.indexOf('function action('), source.indexOf('function node('))}`, context);
  const result = await vm.runInContext(`(async () => {
    let ran = false;
    const background = action(() => new Promise(resolve => setTimeout(resolve, 30)));
    await action(async () => { ran = true; });
    await background;
    return ran;
  })()`, context);
  assert.equal(result, true);
});

test('generation feedback follows submission, running stages and terminal outcomes', () => {
  const source = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  const elements = Object.fromEntries(['generation-progress', 'generation-stage', 'generation-detail', 'generation-spinner', 'generate', 'generation-prompt', 'generation-error', 'active-link', 'cancel-generation', 'recovery'].map(id => [id, { dataset: {}, replaceChildren() {}, setAttribute(key, value) { this[key] = value; } }]));
  const context = vm.createContext({ $: id => elements[id], Date, node() {}, button() {} });
  vm.runInContext(`let jobs = [], submitting = false, currentJob, view = 'create'; ${source.slice(source.indexOf('function renderGeneration('), source.indexOf('async function refreshQa()'))}`, context);
  const render = code => vm.runInContext(`${code}; renderGeneration();`, context);
  render('');
  assert.equal(elements['generation-progress'].hidden, true);
  render('submitting = true');
  assert.equal(elements.generate.disabled, true);
  assert.equal(elements['generation-stage'].textContent, 'Submitting request…');
  render(`submitting = false; jobs = [{ id: 'a', status: 'running', progress: 'generating', started_at: new Date(Date.now() - 12000).toISOString(), attempts: [{number: 2}], input: { request: { prompt: 'Tone' }, budget: { attempts: 3 } }, candidate_ids: [] }]`);
  assert.equal(elements['generation-stage'].textContent, 'Generating your sound…');
  assert.match(elements['generation-detail'].textContent, /Variant 1\/5 · attempt 2\/3 · 12s elapsed/);
  assert.equal(elements['generation-spinner'].hidden, false);
  render("jobs[0].progress = 'evaluating'");
  assert.equal(elements['generation-stage'].textContent, 'Checking the prepared clip…');
  render("jobs[0].status = 'canceling'");
  assert.equal(elements.generate.disabled, true);
  assert.equal(elements['generation-stage'].textContent, 'Stopping generation…');
  render("jobs[0].status = 'failed'");
  assert.equal(elements.generate.disabled, false);
  assert.equal(elements['generation-spinner'].hidden, true);
  assert.equal(elements['generation-stage'].textContent, 'Generation failed');
  render("jobs[0].status = 'completed'; jobs[0].candidate_ids = ['take']");
  assert.equal(elements['generation-stage'].textContent, 'Generation finished — listen to your take');
  render('jobs = []; submitting = false');
  assert.equal(elements.generate.disabled, false);
  assert.equal(elements['generation-progress'].hidden, true);
});

test('presentation groups snapshots and trims by generation, uses durable lineage and exact preferred versions', () => {
  const source = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function groupTakes('), source.indexOf('const takeFor')), context);
  const make = (id, run, cut = null) => ({ candidate_sha256: id, attempt_id: run, evidence: { generation: { id: run, started_at: run === 'run-a' ? '2026-01-01' : '2026-01-02' }, cut } });
  const cut = { id: 'cut', audio_sha256: 'same-audio', bounds: { start_sample: 0, end_sample: 100 } };
  const records = [make('original', 'run-a'), make('analysis', 'run-a'), make('prepared', 'run-a', cut), make('qa', 'run-a', cut), make('trim', 'run-a', { ...cut, id: 'trim', bounds: { start_sample: 10, end_sample: 90 } }), make('second', 'run-b', cut), make('unlinked', 'run-c', cut)];
  context.records = records;
  context.requests = [{ id: 'job-a', candidate_ids: ['original', 'analysis', 'prepared', 'qa'], result: { candidate_sha256: 'qa' }, attempts: [{ id: 'run-a' }] }, { id: 'job-b', sound_id: 'job-a', candidate_ids: ['second'] }];
  const grouped = vm.runInContext('groupTakes(records, requests)', context);
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].versions.length, 3);
  assert.equal(grouped[0].preferred.candidate_sha256, 'qa');
  assert.equal(grouped[0].records.length, 5);
  assert.equal(grouped[1].number, 2);
  assert.equal(grouped[1].sound, 'job-a');
  assert.equal(grouped[2].number, 1);
  assert.equal(grouped[2].preferred, undefined);
  assert.notEqual(grouped[1].id, grouped[0].id);
});

test('batch click and submit handlers coalesce pending intents and retry lost responses', async () => {
  const source = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  const elements = Object.fromEntries(['batch-edit', 'batch-prompt', 'batch-duration', 'status', 'reconnect'].map(id => [id, { value: id === 'batch-duration' ? '5' : 'Tone' }]));
  const storage = new Map(), operations = new Map(), requests = [];
  let loseResponse = false, nextKey = 0;
  const context = vm.createContext({
    $: id => elements[id], uid: () => String(++nextKey),
    recall: (key, fallback) => storage.get(key) ?? fallback,
    remember: (key, value) => storage.set(key, value),
    localStorage: { removeItem: key => storage.delete(key.replace('studio-', '')) },
    say: message => { elements.status.textContent = message; },
    node: () => ({}), refresh: async () => {}, reviewItem: () => ({ key: 'tone' }),
    api: async (path, input, key) => {
      requests.push({ path, input, key });
      if (!operations.has(key)) operations.set(key, { path, input });
      if (loseResponse) { loseResponse = false; throw new Error('Lost response'); }
    },
  });
  vm.runInContext(`let busy = false, pendingAction = Promise.resolve(), reviewBatchId = 'batch', reviewSoundKey = 'tone';
    ${source.slice(source.indexOf('function action('), source.indexOf('function node('))}
    ${source.slice(source.indexOf('function button('), source.indexOf('function title('))}
    ${source.slice(source.indexOf('function recreateButton('), source.indexOf('async function useTake('))}
    ${source.slice(source.indexOf('const batchActions ='), source.indexOf('async function openReviewSound('))}
  `, context);
  // Load the production form handler as well as the production recreation button.
  vm.runInContext(source.split('\n').find(line => line.startsWith("$('batch-edit').onsubmit =")), context);
  context.candidate = { candidate_sha256: 'candidate', evidence: { generation: { request: { duration_seconds: 5 } } } };
  context.node = () => { const element = {}; context.lastButton = element; return element; };
  vm.runInContext('recreateButton(candidate, null)', context);
  for (const activate of [() => context.lastButton.onclick(), () => elements['batch-edit'].onsubmit({ preventDefault() {} })]) {
    let release;
    context.gate = new Promise(resolve => { release = resolve; });
    vm.runInContext('action(() => gate)', context);
    const before = operations.size;
    activate(); activate(); activate();
    const acknowledgement = elements.status.textContent;
    release();
    await vm.runInContext('pendingAction', context);
    assert.equal(operations.size, before + 1);
    assert.match(acknowledgement, /Submitting/);
    activate();
    await vm.runInContext('pendingAction', context);
    assert.equal(operations.size, before + 2, 'a later deliberate activation is allowed');
    loseResponse = true;
    activate();
    await vm.runInContext('pendingAction', context);
    const lost = requests.at(-1);
    activate(); activate();
    await vm.runInContext('pendingAction', context);
    assert.equal(requests.at(-1).key, lost.key);
    assert.equal(operations.size, before + 3, 'retry reattaches to the accepted operation');
  }
});
