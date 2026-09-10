import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
new vm.Script(readFileSync(new URL('./studio.js', import.meta.url), 'utf8'));

import test from 'node:test';

test('winner highlights update when a variation is playing', () => {
  const source = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  const node = (tag, text, parent, attrs = {}) => {
    const classes = new Set();
    const element = { tag, text, attrs, dataset: {}, children: [],
      replaceChildren() { this.children = []; }, setAttribute(k, v) { this.attrs[k] = v; },
      classList: { toggle(k, on) { on ? classes.add(k) : classes.delete(k); }, add(k) { classes.add(k); }, contains: k => classes.has(k) },
      querySelector(selector) { return this.children.find(c => selector === '[data-best]' ? 'data-best' in c.attrs : selector === `[data-variant="${c.attrs['data-variant']}"]`); },
      querySelectorAll() { return this.children.filter(c => c.tag === 'audio'); },
    };
    parent?.children.push(element); return element;
  };
  const box = node('div');
  const context = vm.createContext({ node, $: () => box, identity: c => c.candidate_sha256,
    audio: (c, parent) => Object.assign(node('audio', '', parent), { paused: false }),
    button: (text, parent) => node('button', text, parent), recreateButton() {},
  });
  vm.runInContext(`let currentJob = 'job', reviewBatchId, batchReviews = [], selected;
    let candidates = ['A', 'B'].map(candidate_sha256 => ({candidate_sha256}));
    let jobs = [{id: 'job', sound_id: 'sound', provider: 'local', attempts: [], variants: candidates.map((c, index) => ({index, result: c}))}];
    let selections = [{sound_id: 'sound', candidate_sha256: 'A'}];
    ${source.slice(source.indexOf('function renderBatch('), source.indexOf('function reviewItem('))}
    renderBatch(); selections[0].candidate_sha256 = 'B'; renderBatch();`, context);
  const cards = box.children.filter(c => 'data-variant' in c.attrs);
  assert.deepEqual(cards.map(c => c.classList.contains('chosen')), [false, true]);
  assert.deepEqual(cards.map(c => c.children.find(e => e.tag === 'div').children[0].attrs['aria-pressed']), ['false', 'true']);
});

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
  render(`submitting = false; jobs = [{ id: 'a', status: 'running', progress: 'generating', started_at: new Date(Date.now() - 12000).toISOString(), attempts: [{number: 2}], input: { request: { prompt: 'Tone' }, budget: { attempts: 3 } }, candidate_ids: [] }]`);
  assert.equal(elements['generation-spinner'].hidden, false);
  render("jobs[0].progress = 'evaluating'");
  render("jobs[0].status = 'canceling'");
  assert.equal(elements.generate.disabled, true);
  render("jobs[0].status = 'failed'");
  assert.equal(elements.generate.disabled, false);
  assert.equal(elements['generation-spinner'].hidden, true);
  render("jobs[0].status = 'completed'; jobs[0].candidate_ids = ['take']");
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

test('selection recovery preserves the current choice before transmission and after acceptance', async () => {
  const source = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  for (const accepted of [false, true]) {
    const storage = new Map(), events = [], requests = [];
    let fail = true, nextId = 0, status;
    const context = vm.createContext({
      uid: () => String(++nextId), takeFor: () => ({ sound: 'sound' }), identity: c => `Take ${c.candidate_sha256}`,
      recall: (key, fallback) => storage.get(key) ?? fallback, remember: (key, value) => storage.set(key, value),
      localStorage: { removeItem: key => storage.delete(key.replace('studio-', '')) },
      $: () => ({ dataset: {} }), renderBatch() {}, renderLibrary() {}, refresh: async () => { vm.runInContext('selections = persisted()', context); }, persisted: () => events.slice(-1), say: message => { status = message; },
      api: async (path, value) => {
        if (path === 'selections') return events.slice(-1);
        requests.push({ path, value });
        if (fail && !accepted) { fail = false; throw new Error('Offline'); }
        if (!events.some(e => e.event_id === value.event_id)) {
          assert.equal(value.supersedes, events.at(-1)?.event_id ?? null);
          events.push({ ...value, sound_id: 'sound', candidate_sha256: path.split('/')[1] });
        }
        if (fail) { fail = false; throw new Error('Lost response'); }
      },
    });
    vm.runInContext(`let selections = []; ${source.slice(source.indexOf('async function useTake('), source.indexOf('function renderBatch('))}`, context);
    await assert.rejects(vm.runInContext("useTake({candidate_sha256: 'A'})", context));
    const pending = storage.get('selection-sound');
    await vm.runInContext("useTake({candidate_sha256: 'B'})", context);
    assert.equal(events.at(-1).candidate_sha256, 'B');
    assert.equal(events.length, 2);
    assert.equal(requests[1].value.event_id, pending.value.event_id);
    assert.equal(storage.size, 0);
    assert.match(status, /Take B/);
  }
});

test('different batch intents preserve uncertain keys until explicit recovery', async () => {
  const source = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  for (const accepted of [false, true]) for (const firstAction of ['regenerate', 'recreate']) {
    const storage = new Map(), operations = new Map(), requests = [];
    let fail = true, nextKey = 0, status;
    const context = vm.createContext({
      uid: () => String(++nextKey), $: () => ({}), say: message => { status = message; }, refresh: async () => {},
      recall: (key, fallback) => storage.get(key) ?? fallback, remember: (key, value) => storage.set(key, value),
      localStorage: { removeItem: key => storage.delete(key.replace('studio-', '')) },
      api: async (path, input, key) => {
        requests.push({ path, input, key });
        if (fail && !accepted) { fail = false; throw new Error('Offline'); }
        if (!operations.has(key)) operations.set(key, { path, input });
        if (fail) { fail = false; throw new Error('Lost response'); }
      },
    });
    vm.runInContext(`let busy = false, pendingAction = Promise.resolve(), reviewBatchId = 'batch-a';
      ${source.slice(source.indexOf('function action('), source.indexOf('function node('))}
      ${source.slice(source.indexOf('const batchActions ='), source.indexOf('async function openReviewSound('))}`, context);
    await vm.runInContext(`batchAction('sounds/a/${firstAction}', {prompt: 'A', duration_seconds: 5})`, context);
    const pending = storage.get('batch-submission');
    await vm.runInContext(`batchAction('sounds/a/${firstAction}', {prompt: 'Changed', duration_seconds: 10})`, context);
    assert.equal(requests.length, 1, 'changed input is a new intent even on the same path');
    assert.deepEqual(storage.get('batch-submission'), pending);
    const secondAction = firstAction === 'regenerate' ? 'recreate' : 'regenerate';
    await vm.runInContext(`reviewBatchId = 'batch-b'; batchAction('sounds/b/${secondAction}', {prompt: 'B', duration_seconds: 10})`, context);
    assert.equal(requests.length, 1, 'a new click cannot replay a different uncertain operation');
    assert.deepEqual(storage.get('batch-submission'), pending);
    assert.match(status, /batch-b.*not queued.*batch-a.*Reconnect/i);
    await vm.runInContext("batchMutation(recall('batch-submission', null))", context);
    assert.equal(requests.at(-1).key, pending.key);
    assert.equal(operations.size, 1);
    assert.match(status, /batch-a/);
    await vm.runInContext(`batchAction('sounds/b/${secondAction}', {prompt: 'B', duration_seconds: 10})`, context);
    assert.equal(operations.size, 2);
    assert.equal(requests.at(-1).path, `batches/batch-b/sounds/b/${secondAction}`);
    assert.equal(requests.at(-1).input.prompt, 'B');
    assert.notEqual(requests.at(-1).key, pending.key);
    assert.equal(storage.size, 0);
  }
});
