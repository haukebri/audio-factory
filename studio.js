const $ = id => document.getElementById(id);
const uid = () => crypto.randomUUID().replaceAll('-', '');
let pendingAction = Promise.resolve();
let csrf, candidates = [], jobs = [], takes = [], selected, busy = false, submitting = false, currentJob, readyCandidate;
let batchReviews = [], reviewBatchId = /^#batch\/([a-f0-9]{32})$/.exec(location.hash)?.[1] ?? null, reviewSoundKey;
let view = 'create', comparisonId, feedback = new Map(), selections = [];
const say = message => { if ($('status').textContent !== message) $('status').textContent = message; };
function remember(key, value) { localStorage.setItem('studio-' + key, JSON.stringify(value)); }
function recall(key, fallback) { try { return JSON.parse(localStorage.getItem('studio-' + key)) ?? fallback; } catch { return fallback; } }
const drafts = ['prompt', 'constraints', 'events', 'duration', 'seed'];
for (const id of drafts) { $(id).value = recall(id, $(id).value); $(id).addEventListener($(id).tagName === 'SELECT' ? 'change' : 'input', () => remember(id, $(id).value)); }
if (!$('duration').value) { $('duration').value = '5'; remember('duration', '5'); }
$('blind').checked = recall('blind', false);
async function api(path, value, key) {
  const response = await fetch('/studio/' + path, { method: value === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-CSRF': csrf, ...(key ? { 'Idempotency-Key': key } : {}) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || `Request failed (${response.status})`), { status: response.status });
  return result;
}
function action(operation) {
  pendingAction = pendingAction.then(async () => {
    busy = true;
    try { await operation(); } catch (error) { say(`Operation not completed: ${error.message}. Saved work is preserved.`); $('reconnect').hidden = false; }
    finally { busy = false; }
  });
  return pendingAction;
}
function node(tag, text, parent, attrs = {}) {
  const element = document.createElement(tag); if (text !== undefined) element.textContent = text;
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  parent?.append(element); return element;
}
function button(text, parent, operation, enqueue = action) { const b = node('button', text, parent, { type: 'button' }); b.onclick = () => enqueue(operation); return b; }
function title(c) { return c.evidence.generation.prompt_plan?.intent ?? c.evidence.generation.request.prompt; }
function groupTakes(records, requests) {
  const groups = new Map();
  const root = job => { const seen = new Set(); while (!job?.sound_id && job?.parent_id && !seen.has(job.id)) { seen.add(job.id); const parent = requests.find(j => j.id === job.parent_id); if (!parent) break; job = parent; } return job?.sound_id ?? job?.id; };
  for (const c of records) {
    const run = c.evidence.generation;
    const job = requests.find(j => j.candidate_ids.includes(c.candidate_sha256) || j.attempts?.some(a => a.id === c.attempt_id));
    if (!groups.has(run.id)) groups.set(run.id, { id: run.id, sound: root(job) ?? run.id, job, started: run.started_at ?? '', records: [], versions: [] });
    groups.get(run.id).records.push(c);
  }
  const result = [...groups.values()].sort((a, b) => a.started.localeCompare(b.started) || a.id.localeCompare(b.id));
  const counts = new Map();
  for (const take of result) {
    take.number = (counts.get(take.sound) ?? 0) + 1; counts.set(take.sound, take.number);
    take.preferred = take.records.find(c => c.candidate_sha256 === take.job?.result?.candidate_sha256) ?? take.records.find(c => take.job?.attempts?.some(a => a.result?.candidate_sha256 === c.candidate_sha256));
    const versions = new Map();
    for (const c of take.records) { const cut = c.evidence.cut; const key = cut ? JSON.stringify([cut.audio_sha256, cut.id, cut.bounds]) : 'original'; if (!versions.has(key)) versions.set(key, []); versions.get(key).push(c); }
    for (const records of versions.values()) { const c = records.find(c => c === take.preferred) ?? records[0]; take.versions.push({ records, candidate: c, name: c.evidence.cut ? (c === take.preferred ? 'Prepared clip' : `Trim ${(c.evidence.cut.bounds.start_sample / c.evidence.cut.bounds.sample_rate).toFixed(2)}–${(c.evidence.cut.bounds.end_sample / c.evidence.cut.bounds.sample_rate).toFixed(2)}s`) : 'Original' }); }
  }
  return result;
}
const takeFor = id => takes.find(t => t.records.some(c => c.candidate_sha256 === id));
const versionFor = (take, id) => take.versions.find(v => v.records.some(c => c.candidate_sha256 === id));
const identity = c => { const take = takeFor(c.candidate_sha256); return `Take ${take.number} · ${versionFor(take, c.candidate_sha256).name}`; };
function preferred(take) { const remembered = recall('version-' + take.id, null); return take.records.find(c => c.candidate_sha256 === selections.find(s => s.sound_id === take.sound)?.candidate_sha256) ?? take.records.find(c => c.candidate_sha256 === remembered) ?? take.preferred ?? take.records.find(c => c.evidence.cut) ?? take.records[0]; }
function audio(c, parent, label) {
  const player = node('audio', undefined, parent, { controls: '', preload: 'metadata', 'aria-label': label, src: `/studio/candidates/${c.candidate_sha256}/${c.evidence.cut ? 'audio' : 'source'}` });
  player.addEventListener('play', () => document.querySelectorAll('audio').forEach(other => { if (other !== player) other.pause(); }));
  player.addEventListener('error', () => say('Playback unavailable. Reconnect and reopen this saved version.'));
  return player;
}
function saveLocation() { history.replaceState({ ...history.state, selected, scroll: scrollY }, ''); }
function navigate(next, push = true) {
  if (reviewBatchId && next === 'listen') next = 'batch/' + reviewBatchId;
  if (push) { saveLocation(); history.pushState({ selected, scroll: 0 }, '', '#' + next); }
  const batchMatch = /^batch\/([a-f0-9]{32})$/.exec(next);
  if (next !== 'compare') reviewBatchId = batchMatch?.[1] ?? null;
  if (batchMatch) next = 'listen';
  renderReviewBatch();
  view = ['create', 'listen', 'library', 'compare', 'settings'].includes(next) ? next : 'create';
  document.body.dataset.view = view;
  for (const id of ['create', 'library', 'compare', 'settings']) $(id + '-view').hidden = id === 'create' ? !['create', 'listen'].includes(view) : view !== id;
  for (const link of document.querySelectorAll('nav a')) { if (link.hash === '#' + view || view === 'listen' && link.hash === '#create') link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }
  $('more-menu').open = false;
  if (view === 'compare' && selected && !$('comparison-a').childElementCount) { comparisonCard(candidates.find(c => c.candidate_sha256 === selected), $('comparison-a'), 'A'); $('compare-scope').value = recall('compare-scope', 'sound'); comparisonId = recall('comparison', null); comparisonChoices(); }
  if (view !== 'compare') document.querySelectorAll('#compare-view audio').forEach(p => p.pause());
  if (!['listen', 'create'].includes(view)) document.querySelectorAll('#candidate audio').forEach(p => p.pause());
  remember('view', view);
  if (push) { $('main').focus({ preventScroll: true }); scrollTo(0, 0); }
}
document.addEventListener('click', event => { const link = event.target.closest('a[href^="#"]'); if (!link || link.classList.contains('skip')) return; event.preventDefault(); navigate(link.hash.slice(1)); });
window.addEventListener('popstate', () => action(async () => { if (history.state?.selected && history.state.selected !== selected) await select(history.state.selected); navigate(location.hash.slice(1), false); if (reviewBatchId && view === 'listen') await openReviewSound($('batch-sound').value); scrollTo(0, history.state?.scroll ?? 0); }));
async function loadFeedback() { await Promise.all(candidates.map(async c => { feedback.set(c.candidate_sha256, await api(`candidates/${c.candidate_sha256}/feedback`)); })); }
function humanText(id) { const human = feedback.get(id)?.at(-1); return human ? `Human: ${human.verdict === 'accepted' ? 'Approved' : 'Rejected'}${human.note ? ' · ' + human.note : ''}` : 'Human: Unreviewed'; }
function updateHuman(id) { document.querySelectorAll('[data-human]').forEach(el => { if (el.dataset.human === id) el.textContent = humanText(id); }); }
function automated(c, box) {
  const details = node('details', undefined, box, { 'data-automated': '' }); details.hidden = $('blind').checked;
  node('summary', 'Signal checks and provenance', details);
  node('p', c.evidence.cut?.result?.static?.suspected ? 'Suspected static. Listen before choosing.' : 'Sound accuracy is decided by listening.', details);
  const plan = c.evidence.generation.prompt_plan;
  if (plan) {
    node('p', `Generation prompt: ${c.evidence.generation.request.prompt}`, details);
    if (plan.error) node('p', `Prompt preparation unavailable; used original wording. ${plan.error}`, details);
  }
  const evidence = node('details', undefined, details); node('summary', 'Details · scores and provenance', evidence); node('pre', JSON.stringify(c, null, 2), evidence);
}
async function download(c) {
  const id = c.candidate_sha256; say('Verifying audio and details…');
  const response = await fetch(`/studio/candidates/${id}/export`); if (!response.ok) throw new Error((await response.json()).error);
  const url = URL.createObjectURL(await response.blob()); const link = node('a', undefined, document.body, { href: url, download: `take-${takeFor(id).number}-${id.slice(0, 8)}.tar` }); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); say('Downloaded prepared audio, original, provenance and exact-version feedback.');
}
function decision(c, box, prefix) {
  const id = c.candidate_sha256;
  node('p', humanText(id), box, { 'data-human': id, class: 'human-status' });
  const actions = node('div', undefined, box, { class: 'actions' });
  const reject = node('details', undefined, box, { 'data-review': id }); node('summary', 'Reject / correct review', reject);
  node('p', `Your decision applies to ${identity(c)} only.`, reject, { class: 'hint' });
  const tags = node('fieldset', undefined, reject); node('legend', 'Rejection reasons', tags);
  const saved = recall('review-draft-' + id, { tags: [], note: '' });
  for (const tag of ['wrong_sound', 'extra_events', 'background_noise', 'artifacts', 'bad_trim', 'other']) { const label = node('label', undefined, tags, { class: 'check' }); const input = node('input', undefined, label, { type: 'checkbox', value: tag }); input.checked = saved.tags.includes(tag); label.append(' ' + tag.replaceAll('_', ' ')); }
  node('label', 'Review note (optional)', reject, { for: prefix + '-note' }); const note = node('textarea', undefined, reject, { id: prefix + '-note', rows: '2', maxlength: '4000' }); note.value = saved.note;
  const draft = () => ({ tags: [...tags.querySelectorAll(':checked')].map(e => e.value), note: note.value });
  reject.addEventListener('input', () => { const value = draft(); remember('review-draft-' + id, value); document.querySelectorAll('[data-review]').forEach(other => { if (other !== reject && other.dataset.review === id) { other.querySelector('textarea').value = value.note; other.querySelectorAll('input[type=checkbox]').forEach(input => { input.checked = value.tags.includes(input.value); }); } }); });
  const error = node('p', '', reject, { role: 'alert', class: 'error' });
  const submit = async verdict => {
    const reason_tags = draft().tags; if (verdict === 'rejected' && !reason_tags.length) { reject.open = true; error.textContent = 'Choose at least one rejection reason.'; tags.querySelector('input').focus(); return; }
    const human = feedback.get(id)?.at(-1);
    const value = { candidate_sha256: id, supersedes: human?.event_id ?? null, actor: 'human', verdict, reason_tags: verdict === 'accepted' ? [] : reason_tags, note: note.value };
    const pending = recall('feedback-' + id, null); const event = pending && JSON.stringify(pending.value) === JSON.stringify(value) ? pending : { value, event_id: uid() }; remember('feedback-' + id, event);
    try { await api(`candidates/${id}/feedback`, { ...value, event_id: event.event_id }); localStorage.removeItem('studio-feedback-' + id); feedback.set(id, await api(`candidates/${id}/feedback`)); updateHuman(id); renderLibrary(); error.textContent = ''; say(`Saved ${verdict === 'accepted' ? 'approval' : 'rejection'} for ${identity(c)}. Audio is preserved.`); } catch (e) { error.textContent = e.message; reject.open = true; throw e; }
  };
  button('Approve', actions, () => submit('accepted')).className = 'primary';
  button('Reject', actions, async () => { reject.open = true; tags.querySelector('input').focus(); });
  button('Save rejection', reject, () => submit('rejected'));
  button('Download', actions, () => download(c)); node('p', 'Download includes audio, provenance and review details.', box, { class: 'hint' });
}
function trim(c, box) {
  const id = c.candidate_sha256; const details = node('details', undefined, box); node('summary', 'Trim', details);
  const form = node('form', undefined, details); const pair = node('div', undefined, form, { class: 'pair' });
  const bounds = c.evidence.cut?.bounds; const saved = recall('trim-' + id, null);
  for (const [name, value] of [['start', saved?.start ?? (bounds ? bounds.start_sample / bounds.sample_rate : 0)], ['end', saved?.end ?? (bounds ? bounds.end_sample / bounds.sample_rate : c.evidence.generation.audio.seconds)]]) { const wrap = node('div', undefined, pair); node('label', `${name === 'start' ? 'Start' : 'End'} (seconds in original)`, wrap, { for: 'cut-' + name }); node('input', undefined, wrap, { id: 'cut-' + name, type: 'number', required: '', min: '0', max: c.evidence.generation.audio.seconds, step: 'any', value }); }
  form.oninput = () => remember('trim-' + id, { start: $('cut-start').value, end: $('cut-end').value });
  node('p', 'Save a version with short fades and −3 dB peak normalization. Earlier versions and their reviews stay preserved.', form, { class: 'hint' }); node('button', 'Save version', form);
  const error = node('p', '', form, { role: 'alert', class: 'error' });
  form.onsubmit = event => { event.preventDefault(); action(async () => { try { const result = await api(`candidates/${id}/cut`, { start_seconds: Number($('cut-start').value), end_seconds: Number($('cut-end').value) }); await refresh(); await select(result.candidate_sha256); say('Version saved. Listen and review this exact version.'); $('workspace').focus(); } catch (e) { error.textContent = e.message; } }); };
}
async function select(id) {
  const c = candidates.find(c => c.candidate_sha256 === id); if (!c) return;
  if (selected === id && $('candidate').childElementCount) return;
  feedback.set(id, await api(`candidates/${id}/feedback`));
  selected = id; $('comparison-a').replaceChildren(); remember('selected', id); remember('version-' + c.evidence.generation.id, id);
  $('empty').hidden = true; $('candidate').replaceChildren();
  const take = takeFor(id); const box = node('article', undefined, $('candidate'), { class: 'take' });
  node('p', `Take ${take.number}${c.fixture ? ' · Synthetic fixture' : ''}`, box, { class: 'take-label' }); node('h3', title(c), box);
  node('label', 'Version', box, { for: 'version' }); const choices = node('select', undefined, box, { id: 'version' });
  for (const v of take.versions) { const exact = v.records.find(r => r.candidate_sha256 === id) ?? v.candidate; node('option', v.name, choices, { value: exact.candidate_sha256 }); } choices.value = id; choices.onchange = () => action(async () => { await select(choices.value); $('version').focus(); });
  const duration = c.evidence.cut?.bounds; node('p', `${(duration ? (duration.end_sample - duration.start_sample) / duration.sample_rate : c.evidence.generation.audio.seconds).toFixed(2)} seconds · ${identity(c)}`, box, { class: 'hint' });
  const player = audio(c, box, `Play take · ${identity(c)}`); button('Play take', box, () => player.play());
  const actions = node('div', undefined, box, { class: 'actions' });
  button('Generate 5 more local takes', actions, () => anotherTake(take), operation => { const item = reviewItem(c); return item ? batchAction(`sounds/${item.key}/regenerate`, { prompt: $('batch-prompt').value, duration_seconds: Number($('batch-duration').value) }) : action(operation); });
  recreateButton(c, actions);
  button('Use this take', actions, () => useTake(c));
  button('Compare', actions, () => openCompare('sound'));
  button('Compare versions', actions, () => openCompare('versions'));
  decision(c, box, 'listen'); trim(c, box); const blindLabel = node('label', undefined, box, { class: 'check' }); const blind = node('input', undefined, blindLabel, { type: 'checkbox', 'data-blind': '' }); blind.checked = $('blind').checked; blindLabel.append(' Hide signal details'); blind.onchange = () => { $('blind').checked = blind.checked; $('blind').onchange(); }; automated(c, box);
  if (take.records.length > take.versions.length) { const details = node('details', undefined, box); node('summary', 'Details · exact evidence records', details); node('p', 'Snapshots may refer to identical audio. Human decisions belong to each exact record.', details); const list = node('select', undefined, details, { 'aria-label': 'Exact evidence record' }); for (const record of take.records) node('option', `${versionFor(take, record.candidate_sha256).name} · ${record.candidate_sha256.slice(0, 12)} · ${humanText(record.candidate_sha256)}`, list, { value: record.candidate_sha256 }); list.value = id; list.onchange = () => action(async () => { await select(list.value); const control = document.querySelector('[aria-label="Exact evidence record"]'); control.closest('details').open = true; control.focus(); }); }
  currentJob = take.job?.id ?? currentJob; renderBatch(); renderLibrary();
}
function renderLibrary() {
  $('library').replaceChildren(); const query = $('search').value.toLowerCase(); const filter = $('human-filter').value;
  const sounds = new Map(); for (const take of takes) { if (!sounds.has(take.sound)) sounds.set(take.sound, []); sounds.get(take.sound).push(take); }
  let shown = 0;
  for (const group of sounds.values()) {
    if (!group.some(t => title(t.records[0]).toLowerCase().includes(query))) continue;
    const visible = group.filter(t => filter === 'all' || t.records.some(c => (feedback.get(c.candidate_sha256)?.at(-1)?.verdict ?? 'unreviewed') === filter)); if (!visible.length) continue;
    shown++; const box = node('article', undefined, $('library'), { class: 'take' }); node('h2', title(group[0].records[0]), box); node('p', `${group.length} take${group.length === 1 ? '' : 's'}`, box, { class: 'hint' });
    const best = selections.find(s => s.sound_id === group[0].sound); if (best) button('Open selected best take', box, async () => { await select(best.candidate_sha256); navigate('listen'); });
    for (const take of visible) {
      const row = node('div', undefined, box, { class: 'library-item' }); const chosen = filter === 'all' ? preferred(take) : take.records.find(c => (feedback.get(c.candidate_sha256)?.at(-1)?.verdict ?? 'unreviewed') === filter);
      if (chosen) button(`Take ${take.number} · ${versionFor(take, chosen.candidate_sha256).name} · ${humanText(chosen.candidate_sha256)}`, row, async () => { await select(chosen.candidate_sha256); navigate('listen'); });
      else node('p', `Take ${take.number} · Choose a version`, row);
      const versions = node('details', undefined, row); node('summary', chosen ? 'Versions' : 'Choose a version', versions); if (!chosen) versions.open = true;
      for (const v of take.versions) button(`${v.name} · ${humanText(v.candidate.candidate_sha256)}`, versions, async () => { await select(v.candidate.candidate_sha256); navigate('listen'); });
    }
  }
  if (!shown) node('p', takes.length ? 'No sounds match these filters.' : 'No saved sounds yet. Start in Create.', $('library'), { class: 'empty' });
}
$('search').oninput = renderLibrary; $('human-filter').onchange = renderLibrary;
function comparisonCard(c, target, letter) { target.replaceChildren(); const box = node('article', undefined, target, { class: 'take' }); node('h2', `${letter} · ${identity(c)}`, box); node('p', title(c), box); audio(c, box, `${letter} · ${identity(c)} playback and seek`); decision(c, box, letter); if (!c.evidence.cut) button('Open version to trim', box, async () => { await select(c.candidate_sha256); navigate('listen'); }); automated(c, box); }
function comparisonChoices() {
  remember('compare-scope', $('compare-scope').value);
  const take = takeFor(selected); const scope = $('compare-scope').value; $('compare').replaceChildren(); node('option', 'Choose a second take', $('compare'), { value: '' });
  const choices = scope === 'versions' ? take.versions.map(v => v.records.find(c => c.candidate_sha256 === selected) ?? v.candidate).filter(c => c.candidate_sha256 !== selected) : takes.filter(t => t.id !== take.id && (scope === 'library' || t.sound === take.sound)).flatMap(t => preferred(t) ? [preferred(t)] : t.versions.map(v => v.candidate));
  for (const c of choices) node('option', `${identity(c)} · ${title(c)}`, $('compare'), { value: c.candidate_sha256 });
  if (choices.some(c => c.candidate_sha256 === comparisonId)) { $('compare').value = comparisonId; if (!$('comparison').childElementCount) renderComparison(); }
  else { comparisonId = choices[0]?.candidate_sha256; $('compare').value = comparisonId ?? ''; renderComparison(); }
}
function renderComparison() { remember('compare-scope', $('compare-scope').value); const c = candidates.find(c => c.candidate_sha256 === $('compare').value); comparisonId = c?.candidate_sha256; remember('comparison', comparisonId); $('comparison').replaceChildren(); if (c) comparisonCard(c, $('comparison'), 'B'); else node('p', 'Generate another take, or choose All Library takes.', $('comparison')); }
function openCompare(scope) { if (!selected) return; $('compare-scope').value = scope; comparisonCard(candidates.find(c => c.candidate_sha256 === selected), $('comparison-a'), 'A'); comparisonChoices(); navigate('compare'); }
$('compare').onchange = renderComparison; $('compare-scope').onchange = comparisonChoices;
$('blind').onchange = () => { remember('blind', $('blind').checked); document.querySelectorAll('[data-blind]').forEach(el => { el.checked = $('blind').checked; }); document.querySelectorAll('[data-automated]').forEach(el => { el.hidden = $('blind').checked; }); };
function renderGeneration() {
  const active = jobs.find(job => ['running', 'canceling'].includes(job.status));
  const job = jobs.find(j => j.id === currentJob) ?? active ?? [...jobs].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  const working = submitting || Boolean(active);
  $('generate').disabled = working; $('generate').textContent = submitting ? 'Submitting…' : active ? 'Generation in progress…' : 'Generate 5 local takes';
  $('generation-progress').hidden = !submitting && !job; $('generation-spinner').hidden = !working;
  const stages = { queued: 'Starting your request…', planning: 'Preparing prompt variations…', setup: 'Preparing generation…', generating: 'Generating your sound…', analyzing: 'Checking audio…', cutting: 'Preparing your clip…', evaluating: 'Checking the prepared clip…', retry_pending: 'Preparing another attempt…' };
  const outcomes = { completed: job?.candidate_ids?.length ? 'Generation finished — listen to your take' : 'Generation finished — no audio available', failed: 'Generation failed', canceled: 'Generation canceled', interrupted: 'Generation interrupted — review required', exhausted: 'Budget reached — review saved takes' };
  const stage = submitting ? 'Submitting request…' : active ? active.status === 'canceling' ? 'Stopping generation…' : stages[active.progress] ?? 'Working on your sound…' : outcomes[job?.status] ?? '';
  if ($('generation-stage').textContent !== stage) $('generation-stage').textContent = stage;
  const shown = active ?? job;
  const elapsed = shown ? Math.max(0, Math.floor(((shown.finished_at ? Date.parse(shown.finished_at) : Date.now()) - Date.parse(shown.started_at)) / 1000)) : 0;
  $('generation-detail').textContent = submitting ? 'Saving your request. Please wait.' : shown ? `Variant ${(shown.variant_index ?? 0) + 1}/${shown.provider === "elevenlabs" ? 1 : 5} · attempt ${shown.attempts?.at(-1)?.number ?? 1}/${shown.provider === "elevenlabs" ? 1 : 3} · ${elapsed}s elapsed` : '';
  $('generation-prompt').textContent = shown?.input.request.prompt ?? ''; $('generation-error').textContent = shown?.error ?? (shown?.status === 'failed' ? 'The request failed. Any saved audio remains available below.' : '');
  $('active-link').hidden = !active || view === 'listen'; $('cancel-generation').hidden = !active; $('cancel-generation').disabled = active?.status === 'canceling';
  $('cancel-generation').onclick = () => action(async () => { await api(`jobs/${active.id}/cancel`, {}); await refresh(); });
  const signature = `${shown?.id}:${shown?.status}`;
  if ($('recovery').dataset.signature !== signature) {
    $('recovery').dataset.signature = signature; $('recovery').replaceChildren();
    if (shown?.status === 'interrupted') {
      node('p', 'Recover saved work before starting a new generation. No operation is replayed automatically.', $('recovery'));
      if (shown.version === 2 && shown.attempts) button('Recover saved work', $('recovery'), async () => { await api(`jobs/${shown.id}/recover`, {}); currentJob = shown.id; await refresh(); });
      button('Acknowledge uncertain outcome', $('recovery'), async () => { await api(`jobs/${shown.id}/acknowledge`, {}); await refresh(); say('Acknowledged. Saved audio is preserved; a new request can now be started.'); });
    } else if (shown && ['failed', 'canceled', 'exhausted'].includes(shown.status)) { button('Start a new local batch', $('recovery'), () => submitInput(newTakeInput(shown), `another-${shown.id}`)); }
  }
}
async function refreshQa() {
  const ready = await api('readiness');
  const text = `${ready.generation === 'fixture' ? 'Synthetic test workspace' : ready.generation === 'setup_required' ? 'Local models will be prepared before generation' : 'Local Stable Audio ready'} · ElevenLabs ${ready.elevenlabs === 'configured' ? 'key configured' : 'key required for recreation'}`;
  $('readiness').textContent = text; $('settings-readiness').textContent = text;
}
async function refresh() {
  const [nextJobs, nextCandidates, nextSelections, nextBatches] = await Promise.all([api('jobs'), api('candidates'), api('selections'), api('batches'), refreshQa()]);
  batchReviews = nextBatches;
  selections = nextSelections;
  const completed = nextJobs.filter(j => !['running', 'canceling'].includes(j.status) && jobs.some(old => old.id === j.id && ['running', 'canceling'].includes(old.status)));
  const changed = JSON.stringify(candidates) !== JSON.stringify(nextCandidates); jobs = nextJobs; candidates = nextCandidates; takes = groupTakes(candidates, jobs);
  if (changed) { await loadFeedback(); renderLibrary(); }
  renderReviewBatch(); renderGeneration();
  for (const job of completed) { const id = job.result?.candidate_sha256 ?? job.candidate_ids.at(-1); if (!id) continue; if (view === 'listen' && job.id === currentJob) { const editing = $('candidate').contains(document.activeElement); const playing = [...document.querySelectorAll('#candidate audio')].some(p => !p.paused); if (!editing && !playing) { await select(id); continue; } } readyCandidate = id; $('ready-take').hidden = false; }
  renderBatch();
  const signature = JSON.stringify(jobs); if ($('jobs').dataset.signature === signature) return;
  $('jobs').dataset.signature = signature; $('jobs').replaceChildren();
  if (!jobs.length) node('p', 'No requests yet.', $('jobs'));
  for (const job of [...jobs].reverse()) { const box = node('article', undefined, $('jobs'), { class: 'job' }); node('h3', job.input.request.prompt, box); node('p', `${job.status} · ${job.progress ?? 'queued'} · ${job.provider ?? "historical"}`, box); const details = node('details', undefined, box); node('summary', 'Details', details); node('pre', JSON.stringify(job, null, 2), details); const id = job.result?.candidate_sha256 ?? job.candidate_ids.at(-1); if (id) button('Open saved take', box, async () => { currentJob = job.id; await select(id); navigate('listen'); }); if (job.status === 'interrupted') button('Open recovery', box, () => { currentJob = job.id; renderGeneration(); navigate('listen'); }); }
}
$('ready-take').onclick = () => action(async () => { const c = candidates.find(c => c.candidate_sha256 === readyCandidate), item = c && reviewItem(c); if (item) await openReviewSound(item.key); else { reviewBatchId = null; await select(readyCandidate); } $('ready-take').hidden = true; navigate('listen'); });
function newTakeInput(job) { const request = { ...job.input.request }; delete request.seed; return { request, provider: 'local', sound_parent_id: job.id }; }
async function anotherTake(take) { if (submitting || jobs.some(j => ['running', 'canceling'].includes(j.status))) { say('Wait for this batch or cancel it first.'); return; } const input = take.job ? newTakeInput(take.job) : { request: { prompt: title(take.records[0]), duration_seconds: take.records[0].evidence.generation.request.duration_seconds }, provider: 'local' }; await submitInput(input, `another-${take.id}`); }
function recreateButton(c, parent) {
  const unavailable = c.evidence.generation.request.duration_seconds > 30;
  const b = button(unavailable ? 'ElevenLabs · maximum 30 seconds' : 'Recreate with ElevenLabs', parent, () => recreate(c), operation => { const item = reviewItem(c); return item ? batchAction(`sounds/${item.key}/recreate`, { candidate_sha256: c.candidate_sha256 }) : action(operation); });
  b.disabled = unavailable;
}
async function recreate(c) {
  if (jobs.some(j => ['running', 'canceling'].includes(j.status))) { say('Wait for this batch or cancel it first.'); return; }
  const id = c.candidate_sha256, key = recall('recreate-' + id, null) ?? uid(); remember('recreate-' + id, key);
  try { const job = await api(`candidates/${id}/recreate`, {}, key); currentJob = job.id; remember('current-job', job.id); localStorage.removeItem('studio-recreate-' + id); await refresh(); navigate('listen'); }
  catch (error) { if ([400, 409, 429].includes(error.status)) localStorage.removeItem('studio-recreate-' + id); throw error; }
}
async function useTake(c) {
  const id = c.candidate_sha256, sound = takeFor(id).sound;
  const save = async pending => {
    remember('selection-' + sound, pending);
    await api(`candidates/${pending.id}/select`, pending.value);
    localStorage.removeItem('studio-selection-' + sound);
  };
  try {
    const pending = recall('selection-' + sound, null);
    if (pending) await save(pending);
    selections = await api('selections');
    const latest = selections.find(s => s.sound_id === sound);
    if (latest?.candidate_sha256 !== id) await save({ id, value: { event_id: uid(), supersedes: latest?.event_id ?? null } });
    await refresh(); renderBatch(); renderLibrary();
    if (selections.find(s => s.sound_id === sound)?.candidate_sha256 !== id) throw new Error('The saved winner changed; choose this take again');
    say(`Best take saved: ${identity(c)}. Other takes remain available.`);
  } catch (error) {
    if (error.status === 409) { localStorage.removeItem('studio-selection-' + sound); await refresh(); renderBatch(); renderLibrary(); }
    throw new Error(`${identity(c)} could not be confirmed as best take: ${error.message}. Reconnect and choose this take again`);
  }
}
function renderBatch() {
  const job = jobs.find(j => j.id === currentJob), sound = batchReviews.find(b => b.id === reviewBatchId)?.sounds.find(s => s.key === reviewSoundKey)?.sound_id ?? job?.sound_id ?? takeFor(selected)?.sound;
  const box = $('batch-results');
  if (!sound) return;
  if (box.dataset.sound !== sound) { box.replaceChildren(); box.dataset.sound = sound; node('h3', 'Compare your variations', box); }
  const winner = selections.find(s => s.sound_id === sound)?.candidate_sha256;
  let best = box.querySelector('[data-best]');
  if (!best) best = node('div', undefined, box, { 'data-best': '', class: 'best-take' });
  if (best.dataset.id !== (winner ?? '')) { best.dataset.id = winner ?? ''; best.replaceChildren(); const c = candidates.find(c => c.candidate_sha256 === winner); if (c) { node('strong', `Selected best take: ${identity(c)}`, best); button('Listen / open selected version', best, () => select(winner)); } }

  for (const group of jobs.filter(j => j.sound_id === sound && j.variants)) for (const variant of group.variants) {
    const key = `${group.id}-${variant.index}`;
    let card = box.querySelector(`[data-variant="${key}"]`);
    if (!card) card = node('article', undefined, box, { class: 'variant-card', 'data-variant': key });
    const attempts = group.attempts.filter(a => a.variant_index === variant.index);
    const signature = JSON.stringify([variant.status, variant.result, attempts.map(a => a.result), winner]);
    if (card.dataset.signature === signature || (card.dataset.winner === (winner ?? '') && [...card.querySelectorAll('audio')].some(a => !a.paused))) continue;
    card.dataset.signature = signature; card.dataset.winner = winner ?? ''; card.replaceChildren();
    node('h4', group.provider === 'elevenlabs' ? 'ElevenLabs recreation' : `Local variation ${variant.index + 1}`, card);
    node('p', variant.prompt, card, { class: 'variant-prompt' });
    node('p', `${variant.status} · ${attempts.length}/${group.provider === 'elevenlabs' ? 1 : 3} attempts`, card, { class: 'hint' });
    const c = candidates.find(c => c.candidate_sha256 === variant.result?.candidate_sha256);
    if (c) {
      audio(c, card, `Play ${group.provider} variation ${variant.index + 1}`);
      if (variant.result.reason_tags?.length) node('p', variant.result.reason_tags.join(', ').replaceAll('_', ' '), card, { class: 'error' });
      const actions = node('div', undefined, card, { class: 'actions' });
      const chosen = winner === c.candidate_sha256;
      card.classList.toggle('chosen', chosen);
      const choose = button(chosen ? 'Selected best take' : 'Use this take', actions, () => useTake(c)); choose.setAttribute('aria-pressed', String(chosen));
      recreateButton(c, actions);
      button('Open / trim / download', actions, async () => { await select(c.candidate_sha256); $('candidate').scrollIntoView({ block: 'start' }); });
    }
    const previous = attempts.filter(a => a.result && a.result.candidate_sha256 !== c?.candidate_sha256);
    if (previous.length) { const history = node('details', undefined, card); node('summary', `${previous.length} earlier attempts`, history); for (const attempt of previous) { const old = candidates.find(c => c.candidate_sha256 === attempt.result.candidate_sha256); if (old) { node('p', `Attempt ${attempt.number}: ${attempt.result.reason_tags?.join(', ')}`, history); audio(old, history, `Earlier attempt ${attempt.number}`); const selectedOld = winner === old.candidate_sha256; if (selectedOld) card.classList.add('chosen'); const chooseOld = button(selectedOld ? 'Selected best take' : 'Use this take', history, () => useTake(old)); chooseOld.setAttribute('aria-pressed', String(selectedOld)); button('Open this attempt', history, () => select(old.candidate_sha256)); } } }
  }
}
function reviewItem(c) { return batchReviews.find(b => b.id === reviewBatchId)?.sounds.find(s => s.sound_id === takeFor(c.candidate_sha256)?.sound); }
const batchActions = new Set();
function batchAction(path, input) {
  path = `batches/${reviewBatchId}/${path}`;
  const intent = JSON.stringify([path, input]);
  if (batchActions.has(intent)) return pendingAction;
  const pending = { path, input, key: uid() };
  batchActions.add(intent); say('Submitting request… Please wait.');
  return action(async () => { try { await batchMutation(pending); } finally { batchActions.delete(intent); } });
}
async function batchMutation(pending) {
  const previous = recall('batch-submission', null);
  if (previous) {
    if (JSON.stringify([previous.path, previous.input]) !== JSON.stringify([pending.path, pending.input])) throw new Error(`${pending.path} not queued. Pending ${previous.path} is unresolved. Reconnect to recover it, then request the new action again`);
    pending = previous;
  }
  remember('batch-submission', pending);
  try { await api(pending.path, pending.input, pending.key); localStorage.removeItem('studio-batch-submission'); await refresh(); say(`Queued: ${pending.path}. You can keep reviewing while generation runs.`); }
  catch (error) { if ([400, 403, 404, 409, 413, 415].includes(error.status)) localStorage.removeItem('studio-batch-submission'); throw error; }
}
async function openReviewSound(key) {
  reviewSoundKey = key; remember('batch-sound-' + reviewBatchId, key); renderReviewBatch();
  const sound = batchReviews.find(b => b.id === reviewBatchId)?.sounds.find(s => s.key === key);
  const job = sound?.operations.map(o => jobs.find(j => j.id === o.job_id)).filter(Boolean).at(-1);
  const id = sound?.selection?.candidate_sha256 ?? job?.result?.candidate_sha256;
  if (id) await select(id); else { selected = undefined; $('candidate').replaceChildren(); }
  // select() can open an older selected take; progress still follows the newest queued job.
  currentJob = sound?.operations.at(-1)?.job_id; renderGeneration(); renderBatch();
}
function renderReviewBatch() {
  const list = $('review-batches'), signature = JSON.stringify(batchReviews.map(b => [b.id,b.name,b.status,b.progress]));
  if (list.dataset.signature !== signature) { list.dataset.signature = signature; list.replaceChildren(); if (batchReviews.length) node('h2', 'Batch reviews', list); for (const b of batchReviews) button(`${b.name} · ${b.progress.selected}/${b.progress.total} selected · ${b.status}`, list, async () => { reviewSoundKey = undefined; navigate('batch/' + b.id); await openReviewSound($('batch-sound').value); }); }
  const batch = batchReviews.find(b => b.id === reviewBatchId), box = $('review-batch');
  box.hidden = !reviewBatchId; document.body.classList.toggle('reviewing-batch', Boolean(reviewBatchId));
  if (!reviewBatchId) return;
  $('batch-title').textContent = batch?.name ?? 'Loading batch…';
  if (!batch) { $('batch-error').textContent = 'Batch not loaded. Reconnect if it does not appear.'; return; }
  if (box.dataset.id !== reviewBatchId) { box.dataset.id = reviewBatchId; reviewSoundKey = recall('batch-sound-' + reviewBatchId, null); }
  const sound = batch.sounds.find(s => s.key === reviewSoundKey) ?? batch.sounds[0]; reviewSoundKey = sound.key;
  $('batch-progress').textContent = `${batch.progress.selected} of ${batch.progress.total} sounds selected · ${batch.status}`;
  $('batch-error').textContent = batch.queue_error ?? sound.operations.at(-1)?.error ?? '';
  const choices = $('batch-sound'), choicesSignature = JSON.stringify(batch.sounds.map(s => [s.key,s.status,Boolean(s.selection)]));
  if (choices.dataset.signature !== choicesSignature) { choices.dataset.signature = choicesSignature; choices.replaceChildren(); for (const s of batch.sounds) node('option', `${s.key} · ${s.selection ? 'winner selected' : s.status}`, choices, { value: s.key }); }
  choices.value = sound.key;
  currentJob = sound.operations.at(-1).job_id;
  const editorKey = reviewBatchId + ':' + sound.key;
  if ($('batch-edit').dataset.key !== editorKey) { $('batch-edit').dataset.key = editorKey; const value = recall('batch-edit-' + editorKey, sound.operations.filter(o => o.input.provider === 'local').at(-1).input.request); $('batch-prompt').value = value.prompt; $('batch-duration').value = String(value.duration_seconds); }
  $('batch-regenerate').disabled = !jobs.some(j => j.id === sound.sound_id);
  $('batch-pause').textContent = batch.paused ? 'Resume queued work' : 'Pause queue after current sound';
  $('batch-pause').onclick = () => action(async () => { await api(`batches/${batch.id}/${batch.paused ? 'resume' : 'pause'}`, {}); await refresh(); });
  $('batch-next').onclick = () => action(() => openReviewSound((batch.sounds.find(s => !s.selection && s.key !== sound.key) ?? batch.sounds.find(s => !s.selection) ?? sound).key));
}
$('batch-sound').onchange = () => action(() => openReviewSound($('batch-sound').value));
for (const id of ['batch-prompt','batch-duration']) $(id).addEventListener('input', () => remember('batch-edit-' + $('batch-edit').dataset.key, { prompt: $('batch-prompt').value, duration_seconds: Number($('batch-duration').value) }));
$('batch-edit').onsubmit = event => { event.preventDefault(); batchAction(`sounds/${reviewSoundKey}/regenerate`, { prompt: $('batch-prompt').value, duration_seconds: Number($('batch-duration').value) }); };
async function submitInput(input, intent) {
  if (submitting) return; const requestedView = view; submitting = true; $('compose-error').textContent = ''; renderGeneration();
  const previous = recall('submission', null); const pending = previous ?? { key: uid(), input, intent }; remember('submission', pending);
  try { const job = await api('jobs', pending.input, pending.key); localStorage.removeItem('studio-submission'); currentJob = job.id; remember('current-job', job.id); jobs = [job, ...jobs.filter(j => j.id !== job.id)]; submitting = false; if (view === requestedView && ['create', 'listen'].includes(view)) navigate('listen'); await refresh(); if (!['running', 'canceling'].includes(job.status) && job.result?.candidate_sha256) await select(job.result.candidate_sha256); say('Request saved. Refresh safely to reconnect.'); }
  catch (error) { if ([400, 403, 409, 415, 422, 429].includes(error.status)) localStorage.removeItem('studio-submission'); $('compose-error').textContent = error.message; $('generation-error').textContent = error.message; throw error; } finally { submitting = false; renderGeneration(); }
}
$('compose').onsubmit = event => { event.preventDefault(); if ($('generate').disabled) return;
  const prompt = [$('prompt').value, $('events').value ? `Intended event count: ${$('events').value}.` : '', $('constraints').value.trim() ? `Constraints: ${$('constraints').value.trim()}` : ''].filter(Boolean).join('\n');
  const input = { provider: 'local', request: { prompt, duration_seconds: Number($('duration').value), ...($('seed').value ? { seed: Number($('seed').value) } : {}) } };
  submitting = true; renderGeneration(); action(async () => { submitting = false; await submitInput(input, 'compose'); });
};
async function connect() {
  const response = await fetch('/studio/session', { headers: { 'X-Studio-Bootstrap': '1' } }); if (!response.ok) throw new Error('Local session unavailable'); csrf = (await response.json()).csrf;
  currentJob = recall('current-job', null); await refresh(); await loadFeedback(); renderLibrary();
  const id = recall('selected', null); if (!reviewBatchId && candidates.some(c => c.candidate_sha256 === id)) await select(id);
  const next = location.hash.slice(1) || recall('view', 'create'); navigate(next, false); if (reviewBatchId) await openReviewSound($('batch-sound').value); $('reconnect').hidden = true; say('Connected · saved locally');
  const batchPending = recall('batch-submission', null); if (batchPending) await batchMutation(batchPending);
  const pending = recall('submission', null); if (pending) await submitInput(pending.input, pending.intent);
  else { const job = jobs.find(j => j.id === currentJob); if (job?.result?.candidate_sha256 && job.result.candidate_sha256 !== selected) { if (!selected && view === 'listen') await select(job.result.candidate_sha256); else { readyCandidate = job.result.candidate_sha256; $('ready-take').hidden = false; } } }
}
$('reconnect').onclick = () => action(connect);
renderLibrary(); action(connect); setInterval(() => { if (!busy && csrf) action(refresh); }, 2000);
