import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
new vm.Script(readFileSync(new URL('./studio.js', import.meta.url), 'utf8'));

import test from 'node:test';

test('winner highlights update on every representation without replacing a playing row', () => {
  const source = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  const rows = ['A', 'B', 'B'].map(id => {
    const classes = new Set(), badge = {}, choose = { attrs: {}, hasAttribute: () => false, setAttribute(k, v) { this.attrs[k] = v; } };
    return { dataset: { clip: id }, badge, choose, classes,
      classList: { toggle(k, on) { on ? classes.add(k) : classes.delete(k); } },
      querySelector: selector => selector === '[data-selected]' ? badge : choose,
    };
  });
  const context = vm.createContext({ document: { querySelectorAll: () => rows } });
  vm.runInContext(`let selections = [{candidate_sha256: 'A'}];
    ${source.slice(source.indexOf('function updateSelected('), source.indexOf('function renderClip('))}
    updateSelected(); selections[0].candidate_sha256 = 'B'; updateSelected();`, context);
  assert.deepEqual(rows.map(row => row.classes.has('chosen')), [false, true, true]);
  assert.deepEqual(rows.map(row => row.badge.hidden), [true, false, false]);
  assert.deepEqual(rows.map(row => row.choose.attrs['aria-pressed']), ['false', 'true', 'true']);
  assert.deepEqual(rows.map(row => row.choose.textContent), ['Use this take', 'Selected', 'Selected']);
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
  vm.runInContext(`let jobs = [], submitting = false, submissionError = '', submissionPrompt = '', currentJob = 'a', view = 'create', reviewBatchId, batchReviews = [], selected; const takeFor = () => ({sound:'old-sound'}); ${source.slice(source.indexOf('function renderGeneration('), source.indexOf('async function refreshQa()'))}`, context);
  const render = code => vm.runInContext(`${code}; renderGeneration();`, context);
  render('');
  assert.equal(elements['generation-progress'].hidden, true);
  render('submitting = true');
  assert.equal(elements.generate.disabled, true);
  render(`submitting = false; jobs = [{ id: 'a', status: 'running', progress: 'generating', started_at: new Date(Date.now() - 12000).toISOString(), attempts: [{number: 2}], input: { request: { prompt: 'Tone' }, budget: { attempts: 3 } }, candidate_ids: [] }]`);
  assert.equal(elements['generation-spinner'].hidden, false);
  assert.equal(elements['generation-stage'].textContent, 'Generating your sound…');
  assert.equal(elements['generation-prompt'].textContent, 'Tone');
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
  vm.runInContext(source.slice(source.indexOf('function formatDuration('), source.indexOf('const takeFor')), context);
  const make = (id, run, cut = null) => ({ candidate_sha256: id, attempt_id: run, evidence: { generation: { id: run, started_at: run === 'run-a' ? '2026-01-01' : '2026-01-02' }, cut } });
  const cut = { id: 'cut', audio_sha256: 'same-audio', bounds: { sample_rate: 1000, start_sample: 0, end_sample: 100 } };
  const records = [make('original', 'run-a'), make('analysis', 'run-a'), make('prepared', 'run-a', cut), make('qa', 'run-a', cut), make('trim', 'run-a', { ...cut, id: 'trim', bounds: { sample_rate: 1000, start_sample: 10, end_sample: 90 } }), make('second', 'run-b', cut), make('unlinked', 'run-c', cut)];
  context.records = records;
  context.requests = [{ id: 'job-a', candidate_ids: ['original', 'analysis', 'prepared', 'qa'], result: { candidate_sha256: 'qa' }, attempts: [{ id: 'run-a' }] }, { id: 'job-b', sound_id: 'job-a', candidate_ids: ['second'] }];
  const grouped = vm.runInContext('groupTakes(records, requests)', context);
  assert.equal(grouped.length, 3);
  const first = grouped.find(t => t.id === 'run-a'), second = grouped.find(t => t.id === 'run-b'), orphan = grouped.find(t => t.id === 'run-c');
  assert.equal(first.versions.length, 3);
  assert.deepEqual(Array.from(first.versions, v => v.name), ['Original', 'Automatic · Trim 0 ms–100 ms', 'Edit 1 · Trim 10 ms–90 ms']);
  assert.deepEqual(Array.from(vm.runInContext('groupTakes([...records].reverse(), requests)', context).find(t => t.id === first.id).versions, v => v.name), Array.from(first.versions, v => v.name));
  assert.equal(first.preferred.candidate_sha256, 'qa');
  assert.equal(first.records.length, 5);
  assert.equal(second.number, 2);
  assert.equal(second.sound, 'job-a');
  assert.equal(orphan.number, 1);
  assert.equal(orphan.preferred, undefined);
  assert.notEqual(second.id, first.id);
  // Two five-clip requests retain identities and numbers across retry snapshots and reload order.
  context.records = [make('retry-first', 'retry-run'), ...Array.from({length: 5}, (_, index) => make(`clip-${index}`, `run-${index}`))];
  context.requests = [{ id: 'modern', sound_id: 'modern', started_at: '2026-01-01', candidate_ids: [],
    variants: Array.from({length: 5}, (_, index) => ({index, result: {candidate_sha256: `clip-${index}`}})),
    attempts: [{id: 'retry-run', variant_index: 0}, ...Array.from({length: 5}, (_, index) => ({id: `run-${index}`, variant_index: index}))] }];
  const before = vm.runInContext('groupTakes(records, requests)', context);
  assert.deepEqual(Array.from(before, t => t.number), [1, 2, 3, 4, 5]);
  assert.equal(before[0].records.length, 2);
  assert.equal(before[0].preferred.candidate_sha256, 'clip-0');
  context.records.push(...Array.from({length: 5}, (_, index) => make(`later-${index}`, `later-run-${index}`)));
  context.requests.push({id: 'later-job', sound_id: 'modern', started_at: '2026-01-02', candidate_ids: [],
    variants: Array.from({length: 5}, (_, index) => ({index})),
    attempts: Array.from({length: 5}, (_, index) => ({id: `later-run-${index}`, variant_index: index}))});
  const after = vm.runInContext('groupTakes([...records].reverse(), [...requests].reverse())', context);
  assert.deepEqual(Array.from(after, t => [t.id, t.number]), [...Array.from(before, t => [t.id, t.number]), ...Array.from({length: 5}, (_, index) => [`later-job-${index}`, index + 6])]);
});

test('batch click and submit handlers coalesce pending intents and retry lost responses', async () => {
  const source = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  const elements = Object.fromEntries(['batch-edit', 'batch-prompt', 'batch-duration', 'batch-loop', 'batch-regenerate', 'status', 'reconnect'].map(id => [id, { value: id === 'batch-duration' ? '5' : 'Tone' }]));
  const parent = { querySelector: () => null };
  const makeButton = (text = '') => ({ textContent: text, dataset: {}, style: {}, getBoundingClientRect: () => ({width: 150}), parentElement: parent, setAttribute() {}, removeAttribute() {} });
  Object.assign(elements['batch-regenerate'], makeButton('Generate 5 new clips'));
  const storage = new Map(), operations = new Map(), requests = [];
  let loseResponse = false, nextKey = 0;
  const context = vm.createContext({
    $: id => elements[id], uid: () => String(++nextKey),
    recall: (key, fallback) => storage.get(key) ?? fallback,
    remember: (key, value) => storage.set(key, value),
    localStorage: { removeItem: key => storage.delete(key.replace('studio-', '')) },
    say: message => { elements.status.textContent = message; },
    node: (tag, text) => makeButton(text), document: { querySelectorAll: () => [] }, updateSelected() {}, readiness: { elevenlabs: 'configured' }, refresh: async () => {}, reviewItem: () => ({ key: 'tone' }),
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
    ${source.slice(source.indexOf('async function batchMutation('), source.indexOf('async function openReviewSound('))}
  `, context);
  // Load the production form handler as well as the production recreation button.
  vm.runInContext(source.slice(source.indexOf('const generateMore ='), source.indexOf("$('batch-generate-more').onclick")), context);
  context.candidate = { candidate_sha256: 'candidate', evidence: { generation: { request: { duration_seconds: 5 } } } };
  context.node = (tag, text) => { const element = makeButton(text); if (tag === 'button') context.lastButton = element; return element; };
  vm.runInContext('recreateButton(candidate, null)', context);
  const firstRepresentation = context.lastButton;
  vm.runInContext('recreateButton(candidate, null)', context);
  let releaseDuplicate;
  context.gate = new Promise(resolve => { releaseDuplicate = resolve; });
  vm.runInContext('action(() => gate)', context);
  firstRepresentation.onclick(); context.lastButton.onclick();
  releaseDuplicate(); await vm.runInContext('pendingAction', context);
  assert.equal(operations.size, 1, 'selected and generation rows share one pending operation');
  for (const activate of [() => context.lastButton.onclick(), () => elements['batch-edit'].onsubmit({ preventDefault() {} })]) {
    let release;
    context.gate = new Promise(resolve => { release = resolve; });
    vm.runInContext('action(() => gate)', context);
    const before = operations.size;
    activate(); activate(); activate();
    const acknowledgement = [context.lastButton.textContent, elements['batch-regenerate'].textContent].join(' ');
    release();
    await vm.runInContext('pendingAction', context);
    assert.equal(operations.size, before + 1);
    assert.match(acknowledgement, /Queueing/);
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
      isBatchCandidate: () => false, offerLibrary() {},
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
      ${source.slice(source.indexOf('async function batchMutation('), source.indexOf('async function openReviewSound('))}`, context);
    await assert.rejects(vm.runInContext(`batchMutation({path: 'batches/batch-a/sounds/a/${firstAction}', input: {prompt: 'A', duration_seconds: 5}, key: uid()})`, context));
    const pending = storage.get('batch-submission');
    await assert.rejects(vm.runInContext(`batchMutation({path: 'batches/batch-a/sounds/a/${firstAction}', input: {prompt: 'Changed', duration_seconds: 10}, key: uid()})`, context), /not queued/);
    assert.equal(requests.length, 1, 'changed input is a new intent even on the same path');
    assert.deepEqual(storage.get('batch-submission'), pending);
    const secondAction = firstAction === 'regenerate' ? 'recreate' : 'regenerate';
    await assert.rejects(vm.runInContext(`batchMutation({path: 'batches/batch-b/sounds/b/${secondAction}', input: {prompt: 'B', duration_seconds: 10}, key: uid()})`, context), /batch-b.*not queued.*batch-a.*Reconnect/i);
    assert.equal(requests.length, 1, 'a new click cannot replay a different uncertain operation');
    assert.deepEqual(storage.get('batch-submission'), pending);
    await vm.runInContext("batchMutation(recall('batch-submission', null))", context);
    assert.equal(requests.at(-1).key, pending.key);
    assert.equal(operations.size, 1);
    assert.match(status, /batch-a/);
    await vm.runInContext(`batchMutation({path: 'batches/batch-b/sounds/b/${secondAction}', input: {prompt: 'B', duration_seconds: 10}, key: uid()})`, context);
    assert.equal(operations.size, 2);
    assert.equal(requests.at(-1).path, `batches/batch-b/sounds/b/${secondAction}`);
    assert.equal(requests.at(-1).input.prompt, 'B');
    assert.notEqual(requests.at(-1).key, pending.key);
    assert.equal(storage.size, 0);
  }
});

const trimSource = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
const handler = trimSource.slice(trimSource.indexOf('  save.onclick = () => {'), trimSource.indexOf('  form.onsubmit = event => event.preventDefault(); update();'));

for (const connected of [true, false]) {
  test(`trim Save selects its new version when editor is ${connected ? 'connected' : 'disconnected'}`, async () => {
    const { context, saved, requests, messages } = setup(connected);
    context.save.onclick();
    await context.done;
    assert.equal(context.winner, saved.candidate_sha256);
    assert.deepEqual(requests, ['candidates/automatic/cut']);
    assert.deepEqual(context.chosen, [saved]);
    if (connected) assert.ok(messages.some(message => /selected/i.test(message)), 'visible saved confirmation identifies selection');
  });
}

test('selection failure rejects Save completion without claiming success', async () => {
  const { context, saved, messages } = setup(true, true);
  context.save.onclick();
  await assert.rejects(context.done, /Selection failed/);
  assert.ok(context.candidates.includes(saved), 'new cut remains saved');
  assert.equal(context.winner, 'automatic');
  assert.equal(messages.length, 0, 'no saved-and-selected confirmation');
});

function setup(connected, failSelection = false) {
  const old = { candidate_sha256: 'automatic' }, saved = { candidate_sha256: 'manual' };
  const requests = [], messages = [], remembered = new Map();
  const row = { isConnected: connected, dataset: {}, replaceChildren() {} };
  const context = vm.createContext({
    save: {}, editReady: true, valid: () => true, cutInput: () => ({ start_seconds: .1, end_seconds: .2 }),
    editor: { parentElement: row, isConnected: connected }, editorId: 'automatic', id: 'automatic',
    runButton: (_, operation) => { context.done = operation(); },
    api: async path => { requests.push(path); return saved; },
    refresh: async () => {}, candidates: [old, saved], takeFor: () => ({ id: 'take' }),
    remember: (key, value) => remembered.set(key, value),
    useTake: async c => { context.chosen.push(c); if (failSelection) throw new Error('Selection failed'); context.winner = c.candidate_sha256; },
    winner: 'automatic', chosen: [],
    closeEditor: () => { context.editorId = undefined; },
    renderClip() {}, trim: c => { context.editorId = c.candidate_sha256; },
    node: (_tag, message) => { messages.push(message); },
  });
  vm.runInContext(handler, context);
  return { context, saved, requests, messages };
}

test('short sound durations remain distinguishable down to milliseconds', () => {
  const source = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function formatDuration('), source.indexOf('function groupTakes(')), context);
  const actual = vm.runInContext('[0, 0.0000001, 0.000022676, 0.003, 0.042, 0.9998, 1.234, 60].map(formatDuration)', context);
  assert.deepEqual(Array.from(actual), ['0 ms', '<0.001 ms', '0.023 ms', '3 ms', '42 ms', '999.8 ms', '1.234 s', '60.000 s']);
});

test('feedback refresh handles a real-sized library without exhausting browser requests', async () => {
  const source = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  const ids = Array.from({ length: 1700 }, (_, index) => String(index));
  const feedback = new Map();
  let active = 0, peak = 0;
  const context = vm.createContext({
    feedback, candidates: ids.map(candidate_sha256 => ({ candidate_sha256 })),
    api: async path => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      return [path.split('/')[1]];
    }, updateHuman() {}, renderLibrary() {},
  });
  vm.runInContext(source.slice(source.indexOf('async function loadFeedback('), source.indexOf("window.addEventListener('focus'")), context);
  await vm.runInContext('loadFeedback()', context);
  assert.ok(peak <= 16, `Launched ${peak} simultaneous requests`);
  assert.equal(feedback.size, ids.length);
  for (const id of ids) assert.deepEqual(feedback.get(id), [id]);
});
