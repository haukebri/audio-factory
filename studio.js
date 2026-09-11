const $ = id => document.getElementById(id);
const uid = () => crypto.randomUUID().replaceAll('-', '');
let pendingAction = Promise.resolve();
let csrf, candidates = [], jobs = [], takes = [], selected, busy = false, submitting = false, currentJob;
let batchReviews = [], reviewBatchId = /^#batch\/([a-f0-9]{32})$/.exec(location.hash)?.[1] ?? null, reviewSoundKey;
let view = 'create', feedback = new Map(), selections = [], readiness = {}, editorId, composeParent;
const say = message => { if ($('status').textContent !== message) $('status').textContent = message; };
function remember(key, value) { localStorage.setItem('studio-' + key, JSON.stringify(value)); }
function recall(key, fallback) { try { return JSON.parse(localStorage.getItem('studio-' + key)) ?? fallback; } catch { return fallback; } }
$('loop').checked = recall('loop', false) === true;
$('loop').addEventListener('change', () => remember('loop', $('loop').checked));
const drafts = ['prompt', 'constraints', 'events', 'duration', 'seed'];
for (const id of drafts) { $(id).value = recall(id, $(id).value); $(id).addEventListener($(id).tagName === 'SELECT' ? 'change' : 'input', () => remember(id, $(id).value)); }
if (!$('duration').value) { $('duration').value = '5'; remember('duration', '5'); }
localStorage.removeItem('studio-comparison'); localStorage.removeItem('studio-compare-scope');
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
function button(text, parent, operation, enqueue = action) {
  const b = node('button', text, parent, { type: 'button' });
  b.onclick = () => runButton(b, operation, enqueue); return b;
}
const pendingButtons = new Set();
function runButton(b, operation, enqueue = action) {
  const key = b.dataset.pendingKey ?? b;
  if (b.disabled || pendingButtons.has(key)) return;
  pendingButtons.add(key); updateRecreate();
  const label = b.textContent, minWidth = b.style.minWidth;
  b.style.minWidth = b.getBoundingClientRect().width + 'px';
  b.disabled = true; b.setAttribute('aria-busy', 'true');
  b.textContent = /Use this/.test(label) ? 'Selecting…' : /Save (?:trim|loop)/.test(label) ? 'Saving…' : /Generate|Queue/.test(label) ? 'Queueing…' : label === 'Replay' || label === 'Replay selection' ? 'Playing…' : 'Working…';
  let status = b.parentElement.querySelector(':scope > .action-status');
  if (!status) status = node('p', '', b.parentElement, { class: 'action-status', role: 'status', 'aria-live': 'polite' });
  status.textContent = b.textContent;
  return enqueue(async () => {
    try { await operation(); status.textContent = /Use this/.test(label) ? 'Selected' : /Save (?:trim|loop)/.test(label) ? 'Trim saved.' : /Generate|Queue/.test(label) ? 'Queued. You can keep listening.' : 'Done.'; }
    catch (error) { status.textContent = error.message; if (enqueue === action) { say('Operation not completed. Saved work is preserved.'); $('reconnect').hidden = false; } }
    finally { pendingButtons.delete(key); b.disabled = false; b.removeAttribute('aria-busy'); b.textContent = label; b.style.minWidth = minWidth; updateSelected(); updateRecreate(); if (['batch-pause', 'batch-export', 'batch-regenerate', 'batch-generate-more'].includes(b.id)) renderReviewBatch(); if (b.id === 'cancel-generation') renderGeneration(); }
  });
}
const local = operation => operation();
function title(c) { if (!c) return 'Sound'; return c.evidence.generation.prompt_plan?.intent ?? c.evidence.generation.request.prompt; }
function groupTakes(records, requests) {
  const groups = new Map();
  const root = job => { const seen = new Set(); while (!job?.sound_id && job?.parent_id && !seen.has(job.id)) { seen.add(job.id); const parent = requests.find(j => j.id === job.parent_id); if (!parent) break; job = parent; } return job?.sound_id ?? job?.id; };
  const ordered = [...requests].sort((a,b) => (a.started_at ?? '').localeCompare(b.started_at ?? '') || a.id.localeCompare(b.id));
  for (const c of records) {
    const run = c.evidence.generation;
    const job = requests.find(j => j.candidate_ids.includes(c.candidate_sha256) || j.attempts?.some(a => a.id === c.attempt_id));
    const attempt = job?.attempts?.find(a => a.id === c.attempt_id), variant = attempt?.variant_index ?? 0;
    const key = job?.variants ? `${job.id}-${variant}` : run.id;
    if (!groups.has(key)) groups.set(key, { id: key, sound: root(job) ?? run.id, job, variant, started: run.started_at ?? '', records: [], versions: [] });
    groups.get(key).records.push(c);
  }
  const result = [...groups.values()].sort((a,b) => ordered.indexOf(a.job) - ordered.indexOf(b.job) || a.variant - b.variant || a.started.localeCompare(b.started));
  for (const take of result) {
    const preceding = ordered.filter(j => root(j) === take.sound).slice(0, ordered.filter(j => root(j) === take.sound).indexOf(take.job));
    const legacyIndex = result.filter(t => t.job === take.job && t.sound === take.sound).indexOf(take);
    take.number = 1 + (take.job?.variants ? take.variant : legacyIndex) + preceding.reduce((n,j) => n + (j.variants?.length ?? (result.filter(t => t.job === j).length || 1)), 0);
    take.preferred = take.records.find(c => c.candidate_sha256 === take.job?.variants?.find(v => v.index === take.variant)?.result?.candidate_sha256) ?? take.records.find(c => c.candidate_sha256 === take.job?.result?.candidate_sha256) ?? take.records.find(c => take.job?.attempts?.some(a => a.result?.candidate_sha256 === c.candidate_sha256));
    const versions = new Map();
    for (const c of take.records) { const cut = c.evidence.cut; const key = cut ? JSON.stringify([cut.audio_sha256, cut.id, cut.bounds]) : c.evidence.generation.id; if (!versions.has(key)) versions.set(key, []); versions.get(key).push(c); }
    for (const records of versions.values()) { const c = records.find(c => c === take.preferred) ?? records[0]; take.versions.push({ records, candidate: c, name: c.evidence.cut?.loop ? `Loop ${(c.evidence.cut.loop.output_frames / c.evidence.cut.bounds.sample_rate).toFixed(2)} s` : c.evidence.cut ? `Trim ${(c.evidence.cut.bounds.start_sample / c.evidence.cut.bounds.sample_rate).toFixed(2)}–${(c.evidence.cut.bounds.end_sample / c.evidence.cut.bounds.sample_rate).toFixed(2)} s` : 'Original' }); }
  }
  return result;
}
const takeFor = id => takes.find(t => t.records.some(c => c.candidate_sha256 === id));
const versionFor = (take, id) => take.versions.find(v => v.records.some(c => c.candidate_sha256 === id));
const identity = c => { const take = takeFor(c.candidate_sha256); return `${soundName(take.sound)} · Clip ${take.number} · ${take.job?.provider === 'elevenlabs' ? 'ElevenLabs' : 'Local'} · ${clipDuration(c).toFixed(2)} s${c.evidence.cut ? ' · ' + versionFor(take, c.candidate_sha256).name : ''}`; };
function preferred(take) { const remembered = recall('version-' + take.id, null) ?? take.records.map(c => recall('version-' + c.evidence.generation.id, null)).find(Boolean); return take.records.find(c => c.candidate_sha256 === selections.find(s => s.sound_id === take.sound)?.candidate_sha256) ?? take.records.find(c => c.candidate_sha256 === remembered) ?? take.preferred ?? take.records.find(c => c.evidence.cut) ?? take.records[0]; }
const clipDuration = c => c.evidence.cut ? (c.evidence.cut.loop?.output_frames ?? (c.evidence.cut.bounds.end_sample - c.evidence.cut.bounds.start_sample)) / c.evidence.cut.bounds.sample_rate : c.evidence.generation.audio.seconds;
function soundName(sound) { const item = batchReviews.flatMap(b => b.sounds).find(s => s.sound_id === sound); return item ? item.key.replaceAll('_', ' ').replaceAll('-', ' ') : title(takes.find(t => t.sound === sound)?.records[0]).split('\n')[0]; }
let loopContext, loopNode, loopPreviewEpoch = 0;
function stopLoopPreview() {
  loopPreviewEpoch++;
  if (loopNode) { loopNode.stop(); loopNode.disconnect(); loopNode = undefined; }
  if (loopContext) { void loopContext.close(); loopContext = undefined; }
}
function closeEditor() { stopLoopPreview(); if (!editorId) return; const editor = document.querySelector('.trim-editor'); editor?.querySelectorAll('audio').forEach(a => a.pause()); editor?.remove(); editorId = undefined; }
function audio(c, parent, label, source = false) {
  const player = node('audio', undefined, parent, { controls: '', preload: 'metadata', 'aria-label': label, src: `/studio/candidates/${c.candidate_sha256}/${source || !c.evidence.cut ? 'source' : 'audio'}` });
  player.addEventListener('play', () => { stopLoopPreview(); document.querySelectorAll('audio').forEach(other => { if (other !== player) other.pause(); }); if (editorId && editorId !== c.candidate_sha256) closeEditor(); });
  player.addEventListener('error', () => { let error = parent.querySelector('.playback-error'); if (!error) error = node('p', '', parent, { class: 'playback-error error', role: 'status' }); error.textContent = 'Audio could not load. Reconnect and replay this clip.'; });
  return player;
}
function saveLocation() { history.replaceState({ ...history.state, selected, scroll: scrollY }, ''); }
function navigate(next, push = true) {
  if (reviewBatchId && next === 'listen') next = 'batch/' + reviewBatchId;
  if (push) { saveLocation(); history.pushState({ selected, scroll: 0 }, '', '#' + next); }
  const batchMatch = /^batch\/([a-f0-9]{32})$/.exec(next);
  if (next === 'compare') next = 'listen';
  reviewBatchId = batchMatch?.[1] ?? (next === 'listen' ? reviewBatchId : null);
  if (batchMatch) next = 'listen';
  renderReviewBatch();
  view = ['create', 'listen', 'library', 'settings'].includes(next) ? next : 'create';
  document.body.dataset.view = view;
  for (const id of ['create', 'library', 'settings']) $(id + '-view').hidden = id === 'create' ? !['create', 'listen'].includes(view) : view !== id;
  for (const link of document.querySelectorAll('nav a')) { if (link.hash === '#' + view || view === 'listen' && link.hash === '#create') link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }
  $('more-menu').open = false;
  if (!$('workspace').getClientRects().length) { closeEditor(); $('workspace').querySelectorAll('audio').forEach(p => p.pause()); }
  remember('view', view);
  if (push) { $('main').focus({ preventScroll: true }); scrollTo(0, 0); }
}
document.addEventListener('click', event => { const link = event.target.closest('a[href^="#"]'); if (!link || link.classList.contains('skip')) return; event.preventDefault(); if (link.hash === '#create') composeParent = undefined; navigate(link.hash.slice(1)); });
window.addEventListener('popstate', async () => { if (history.state?.selected && history.state.selected !== selected) await select(history.state.selected); navigate(location.hash.slice(1), false); if (reviewBatchId && view === 'listen') await openReviewSound($('batch-sound').value); scrollTo(0, history.state?.scroll ?? 0); });
async function loadFeedback(ids = candidates.map(c => c.candidate_sha256)) {
  const histories = await Promise.all(ids.map(id => api(`candidates/${id}/feedback`)));
  let changed = false;
  ids.forEach((id, index) => {
    if (JSON.stringify(feedback.get(id)) === JSON.stringify(histories[index])) return;
    feedback.set(id, histories[index]); updateHuman(id); changed = true;
  });
  if (changed) renderLibrary();
}
window.addEventListener('focus', () => { if (csrf) action(() => loadFeedback()); });
function humanText(id) { const human = feedback.get(id)?.at(-1); return human ? `Human: ${human.verdict === 'accepted' ? 'Approved' : 'Rejected'}${human.note ? ' · ' + human.note : ''}` : 'Human: Unreviewed'; }
function updateHuman(id) {
  document.querySelectorAll('[data-human]').forEach(el => { if (el.dataset.human === id) el.textContent = humanText(id); });
  document.querySelectorAll('[aria-label="Exact evidence record"] option').forEach(el => {
    if (el.value === id) el.textContent = `${versionFor(takeFor(id), id).name} · ${id.slice(0, 12)} · ${humanText(id)}`;
  });
}
function renderDiagnostics() {
  const box = $('diagnostics'); if (!box) return; const signature = JSON.stringify([candidates, [...feedback]]); if (box.dataset.signature === signature) return;
  box.dataset.signature = signature; box.replaceChildren();
  for (const c of candidates) { const details = node('details', undefined, box); node('summary', identity(c), details); node('p', humanText(c.candidate_sha256), details); node('pre', JSON.stringify({ candidate: c, review_history: feedback.get(c.candidate_sha256) ?? [] }, null, 2), details); }
}
async function download(c) {
  const id = c.candidate_sha256; say('Verifying audio and details…');
  const response = await fetch(`/studio/candidates/${id}/export`); if (!response.ok) throw new Error((await response.json()).error);
  const url = URL.createObjectURL(await response.blob()); const link = node('a', undefined, document.body, { href: url, download: `take-${takeFor(id).number}-${id.slice(0, 8)}.tar` }); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); say('Downloaded prepared audio, original, provenance and exact-version feedback.');
}
function trim(c, box) {
  if (editorId === c.candidate_sha256) { closeEditor(); return; } closeEditor(); editorId = c.candidate_sha256;
  const id = c.candidate_sha256, seconds = c.evidence.generation.audio.seconds, bounds = c.evidence.cut?.bounds;
  const draft = recall('trim-' + id, { loop: c.evidence.cut?.request?.loop ?? c.evidence.generation.request.loop ?? false, crossfade: c.evidence.cut?.loop?.overlap_frames ? c.evidence.cut.loop.overlap_frames / bounds.sample_rate : 0.5, preserveNative: c.evidence.cut?.loop?.processing_version === 'native-gain-v1', start: bounds ? bounds.start_sample / bounds.sample_rate : 0, end: bounds ? bounds.end_sample / bounds.sample_rate : seconds });
  draft.loop ??= c.evidence.cut?.request?.loop ?? c.evidence.generation.request.loop ?? false; draft.crossfade ??= 0.5; draft.curve ??= c.evidence.cut?.loop?.curve ?? 'equal-power';
  draft.start = Math.max(0, Math.min(seconds, Number(draft.start))); draft.end = Math.max(0, Math.min(seconds, Number(draft.end)));
  const editor = node('section', undefined, box, { class: 'trim-editor', 'data-editor': id }); node('h5', `Trim · ${identity(c)}`, editor);
  const form = node('form', undefined, editor), duration = node('p', '', form, { class: 'trim-duration', role: 'status' });
  const preview = audio(c, editor, `Trim preview · ${identity(c)}`, true); preview.controls = false;
  const error = node('p', '', form, { class: 'error', role: 'status' });
  const valid = () => draft.start < draft.end && (!draft.loop || draft.crossfade >= 0.05 && draft.crossfade <= 2 && draft.end - draft.start >= 0.2);
  const cutInput = () => draft.loop && draft.preserveNative ? { loop: true } : { start_seconds: draft.start, end_seconds: draft.end, loop: draft.loop, ...(draft.loop ? { crossfade_seconds: draft.crossfade, curve: draft.curve } : {}) };
  let save;
  const update = () => { remember('trim-' + id, draft); duration.textContent = `Selection: ${Math.max(0, draft.end - draft.start).toFixed(2)} seconds`; error.textContent = valid() ? '' : 'Choose Start before End; loops need at least 0.2 seconds and a 0.05–2 second crossfade.'; if (save) { save.disabled = save.hasAttribute('aria-busy') || !valid(); if (!save.hasAttribute('aria-busy')) save.textContent = draft.loop ? 'Save loop' : 'Save trim'; } preview.pause(); stopLoopPreview(); };
  for (const name of ['start', 'end']) {
    const label = node('label', `${name === 'start' ? 'Start' : 'End'} (seconds in original)`, form, { for: `cut-${name}` });
    const output = node('output', Number(draft[name]).toFixed(2), label);
    const range = node('input', undefined, form, { id: `cut-${name}`, type: 'range', min: '0', max: seconds, step: '0.01', value: draft[name] });
    range.oninput = () => { draft[name] = Math.max(0, Math.min(seconds, Number(range.value))); output.textContent = draft[name].toFixed(2); draft.preserveNative = false; update(); };
  }
  const loopLabel = node('label', undefined, form, { class: 'loop-choice' });
  const loop = node('input', undefined, loopLabel, { type: 'checkbox', id: 'cut-loop' }); loop.checked = draft.loop;
  loopLabel.append(document.createTextNode(' Loop'));
  node('label', 'Crossfade (seconds)', form, { for: 'cut-crossfade' });
  const fade = node('input', undefined, form, { id: 'cut-crossfade', type: 'number', min: '0.05', max: '2', step: '0.05', value: draft.crossfade });
  fade.disabled = !draft.loop;
  loop.onchange = () => { draft.loop = loop.checked; fade.disabled = !draft.loop; update(); };
  fade.oninput = () => { draft.crossfade = Number(fade.value); draft.preserveNative = false; update(); };
  const details = node('details', undefined, form); node('summary', 'Loop details', details);
  const curveLabel = node('label', 'Crossfade curve', details);
  const curve = node('select', undefined, curveLabel);
  node('option', 'Equal power · diffuse ambience', curve, { value: 'equal-power' });
  node('option', 'Equal gain · correlated sound', curve, { value: 'equal-gain' }); curve.value = draft.curve;
  curve.onchange = () => { draft.curve = curve.value; draft.preserveNative = false; update(); };
  if (draft.preserveNative) node('p', 'Native loop retained. Changing bounds, curve or crossfade creates a repair.', details, { class: 'hint' });
  let stopFrame;
  const stop = () => { cancelAnimationFrame(stopFrame); preview.pause(); stopLoopPreview(); };
  const checkEnd = () => { if (preview.currentTime >= draft.end) { stop(); preview.currentTime = draft.end; } else if (!preview.paused) stopFrame = requestAnimationFrame(checkEnd); };
  preview.addEventListener('pause', () => cancelAnimationFrame(stopFrame));
  preview.addEventListener('timeupdate', () => { if (preview.currentTime >= draft.end) { stop(); preview.currentTime = draft.end; } });
  const actions = node('div', undefined, form, { class: 'actions' });
  button('Replay selection', actions, async () => { if (!valid()) throw new Error('Start must be before End.'); stop(); preview.currentTime = draft.start; await preview.play().catch(error => { if (error.name !== 'AbortError' || !preview.paused) throw error; }); checkEnd(); }, local);
  button('Preview loop', actions, async () => {
    if (!draft.loop || !valid()) throw new Error('Enable Loop and choose valid bounds and crossfade.');
    stop(); document.querySelectorAll('audio').forEach(player => player.pause());
    const epoch = loopPreviewEpoch, input = cutInput();
    const context = new AudioContext({ sampleRate: 44100 }); loopContext = context;
    try {
      await context.resume();
      const { decodeLoopWav, renderLoop, quantizeLoop } = await import('/loop-audio.mjs');
      const response = await fetch(`/studio/candidates/${id}/source`);
      if (!response.ok) throw new Error('Original audio could not load.');
      const source = decodeLoopWav(await response.arrayBuffer());
      if (epoch !== loopPreviewEpoch || !editor.isConnected) return;
      const rendered = renderLoop(source.samples, source.sampleRate, source.channels, { ...input,
        native_provider_loop: c.evidence.generation.runtime.backend === 'elevenlabs' && c.evidence.generation.settings.loop === true });
      const pcm = quantizeLoop(rendered.samples);
      const buffer = context.createBuffer(source.channels, rendered.evidence.output_frames, source.sampleRate);
      for (let channel = 0; channel < source.channels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let frame = 0; frame < data.length; frame++) data[frame] = pcm[frame * source.channels + channel];
      }
      loopNode = context.createBufferSource(); loopNode.buffer = buffer; loopNode.loop = true;
      loopNode.connect(context.destination); loopNode.start();
      duration.textContent = `Loop: ${(buffer.length / buffer.sampleRate).toFixed(2)} seconds · repeating until paused`;
    } catch (error) { if (epoch === loopPreviewEpoch) stopLoopPreview(); throw error; }
  }, local);
  button('Pause', actions, () => { stop(); duration.textContent = 'Preview paused.'; }, local);
  node('p', 'Replay selection plays the original. Preview loop plays the proposed blend continuously; listen for at least three cycles. Save creates a version. Download uses that saved version.', form, { class: 'hint' });
  save = node('button', 'Save trim', form, { type: 'button' }); save.dataset.pendingKey = 'trim-' + id;
  save.onclick = () => {
    if (!valid()) return;
    const input = cutInput(), row = editor.parentElement;
    runButton(save, async () => {
      const result = await api(`candidates/${id}/cut`, input);
      const stillEditing = editorId === id && editor.isConnected && row.isConnected;
      if (stillEditing) closeEditor();
      await refresh();
      const saved = candidates.find(c => c.candidate_sha256 === result.candidate_sha256);
      remember('version-' + takeFor(saved.candidate_sha256).id, saved.candidate_sha256);
      if (stillEditing && row.isConnected && !editorId) { row.dataset.manualVersion = 'true'; row.replaceChildren(); renderClip(saved, row); trim(saved, row); node('p', 'Version saved. Choose Use this take to select this version.', row, { role: 'status' }); }
    });
  };
  form.onsubmit = event => event.preventDefault(); update();
}
async function select(id) {
  const c = candidates.find(c => c.candidate_sha256 === id); if (!c) return;
  if (takeFor(selected)?.sound !== takeFor(id)?.sound) { closeEditor(); document.querySelectorAll('audio').forEach(p => p.pause()); }
  selected = id; remember('selected', id); remember('version-' + takeFor(id).id, id);
  currentJob = takeFor(id).job?.id; $('empty').hidden = true; renderBatch(); renderGeneration(); renderLibrary();
}
function updateSelected() {
  for (const row of document.querySelectorAll('[data-clip]')) {
    const id = row.dataset.clip, chosen = selections.some(s => s.candidate_sha256 === id); row.classList.toggle('chosen', chosen);
    const badge = row.querySelector('[data-selected]'); if (badge) badge.hidden = !chosen;
    const choose = row.querySelector('[data-choose]'); if (choose) { choose.setAttribute('aria-pressed', String(chosen)); if (!choose.hasAttribute('aria-busy')) choose.textContent = chosen ? 'Selected' : 'Use this take'; }
  }
}
function renderClip(c, row, pinned = false) {
  row.dataset.clip = c.candidate_sha256;
  if (c.evidence.cut?.request?.loop ?? c.evidence.generation.request.loop) node('span', 'Loop', row, { class: 'loop-badge' });
  node('h4', identity(c), row); node('strong', 'Selected', row, { 'data-selected': '', class: 'selected-badge', hidden: '' });
  const player = audio(c, row, identity(c)); const actions = node('div', undefined, row, { class: 'actions' });
  button('Replay', actions, async () => { player.currentTime = 0; await player.play().catch(error => { if (error.name !== 'AbortError' || !player.paused) throw error; }); }, local);
  const choose = button('Use this take', actions, () => useTake(c)); choose.dataset.choose = ''; choose.dataset.pendingKey = 'select-' + c.candidate_sha256;
  button('Trim', actions, () => {
    if (!pinned) return trim(c, row);
    const target = $('batch-results').querySelector(`[data-take="${takeFor(c.candidate_sha256).id}"]`); if (!target) return;
    const group = target.closest('details'); group.open = true; group.dataset.manual = 'true';
    if (target.dataset.clip !== c.candidate_sha256) { target.querySelectorAll('audio').forEach(p => p.pause()); target.replaceChildren(); renderClip(c, target); }
    trim(c, target); target.scrollIntoView({ block: 'nearest' });
  }, local);
  const secondary = node('details', undefined, row, { class: 'clip-secondary' }); node('summary', 'More clip actions', secondary);
  const versions = takeFor(c.candidate_sha256).versions; row.dataset.versionCount = String(versions.length); row.dataset.preferred = takeFor(c.candidate_sha256).preferred?.candidate_sha256 ?? '';
  if (!pinned && versions.length > 1) { const label = node('label', 'Saved version', secondary); const list = node('select', undefined, label, { 'aria-label': 'Saved version' }); for (const v of versions) node('option', v.name, list, { value: (v.records.find(r => r.candidate_sha256 === c.candidate_sha256) ?? v.candidate).candidate_sha256 }); list.value = c.candidate_sha256; list.onchange = () => { row.dataset.manualVersion = 'true'; closeEditor(); player.pause(); const next = candidates.find(c => c.candidate_sha256 === list.value); remember('version-' + takeFor(next.candidate_sha256).id, next.candidate_sha256); row.replaceChildren(); renderClip(next, row); }; }
  recreateButton(c, secondary); button('Download', secondary, () => download(c)); updateSelected();
}
function renderLibrary() {
  const signature = JSON.stringify([candidates.map(c => c.candidate_sha256), selections, $('search').value, $('human-filter').value]); if ($('library').dataset.signature === signature) return; $('library').dataset.signature = signature;
  const focused = $('library').contains(document.activeElement) ? document.activeElement.dataset.libraryFocus : null;
  const disclosures = new Map([...$('library').querySelectorAll('details')].map(details => [details.querySelector('summary').dataset.libraryFocus, details.open]));
  $('library').replaceChildren(); const query = $('search').value.toLowerCase(); const filter = $('human-filter').value;
  const sounds = new Map(); for (const take of takes) { if (!sounds.has(take.sound)) sounds.set(take.sound, []); sounds.get(take.sound).push(take); }
  let shown = 0;
  for (const group of sounds.values()) {
    if (!group.some(t => title(t.records[0]).toLowerCase().includes(query))) continue;
    const hasSelection = selections.some(s => s.sound_id === group[0].sound); const visible = filter === 'all' || (filter === 'selected' ? hasSelection : !hasSelection) ? group : []; if (!visible.length) continue;
    shown++; const box = node('article', undefined, $('library'), { class: 'take' }); node('h2', title(group[0].records[0]), box); node('p', `${group.length} take${group.length === 1 ? '' : 's'}`, box, { class: 'hint' });
    const best = selections.find(s => s.sound_id === group[0].sound); if (best) button('Open selected best take', box, async () => { await select(best.candidate_sha256); navigate('listen'); }, local).dataset.libraryFocus = 'best-' + group[0].sound;
    for (const take of visible) {
      const row = node('div', undefined, box, { class: 'library-item' }); const chosen = preferred(take);
      if (chosen) button(`${identity(chosen)}${selections.some(s => s.candidate_sha256 === chosen.candidate_sha256) ? ' · Selected' : ''}`, row, async () => { await select(chosen.candidate_sha256); navigate('listen'); }, local).dataset.libraryFocus = take.id;
      else node('p', `Take ${take.number} · Choose a version`, row);
      const versions = node('details', undefined, row); node('summary', chosen ? 'Versions' : 'Choose a version', versions).dataset.libraryFocus = 'versions-' + take.id; versions.open = disclosures.get('versions-' + take.id) ?? !chosen;
      for (const v of take.versions) button(v.name, versions, async () => { await select(v.candidate.candidate_sha256); navigate('listen'); }, local).dataset.libraryFocus = v.candidate.candidate_sha256;
    }
  }
  if (!shown) node('p', takes.length ? 'No sounds match these filters.' : 'No saved sounds yet. Start in Create.', $('library'), { class: 'empty' });
  if (focused) {
    const target = [...$('library').querySelectorAll('[data-library-focus]')].find(el => el.dataset.libraryFocus === focused) ?? $('human-filter');
    const details = target.closest('details'); if (details) details.open = true;
    target.focus({ preventScroll: true });
  }
}
$('search').oninput = renderLibrary; $('human-filter').onchange = renderLibrary;
function renderGeneration() {
  const sound = reviewBatchId ? batchReviews.find(b => b.id === reviewBatchId)?.sounds.find(s => s.key === reviewSoundKey)?.sound_id : takeFor(selected)?.sound;
  const active = jobs.find(job => ['running', 'canceling'].includes(job.status) && (!sound || (job.sound_id ?? job.id) === sound));
  const job = jobs.find(j => j.id === currentJob) ?? active ?? (!sound ? [...jobs].sort((a, b) => b.started_at.localeCompare(a.started_at))[0] : undefined);
  const working = submitting || Boolean(active);
  $('generate').disabled = working; $('generate').textContent = submitting ? 'Submitting…' : active ? 'Generation in progress…' : 'Generate 5 local takes';
  $('generation-progress').hidden = !submitting && (!job || !active && job.status === 'completed'); $('generation-spinner').hidden = !working;
  const stages = { queued: 'Starting your request…', planning: 'Preparing prompt variations…', setup: 'Preparing generation…', generating: 'Generating your sound…', analyzing: 'Checking audio…', cutting: 'Preparing your clip…', evaluating: 'Checking the prepared clip…', retry_pending: 'Preparing another attempt…' };
  const outcomes = { completed: job?.candidate_ids?.length ? 'Generation finished — listen to your take' : 'Generation finished — no audio available', failed: 'Generation failed', canceled: 'Generation canceled', interrupted: 'Generation interrupted — review required', exhausted: 'Budget reached — review saved takes' };
  const stage = submitting ? 'Submitting request…' : active ? active.status === 'canceling' ? 'Stopping generation…' : stages[active.progress] ?? 'Working on your sound…' : outcomes[job?.status] ?? '';
  if ($('generation-stage').textContent !== stage) $('generation-stage').textContent = stage;
  const shown = active ?? job;
  const elapsed = shown ? Math.max(0, Math.floor(((shown.finished_at ? Date.parse(shown.finished_at) : Date.now()) - Date.parse(shown.started_at)) / 1000)) : 0;
  $('generation-detail').textContent = submitting ? 'Saving your request. Please wait.' : shown ? `Variant ${(shown.variant_index ?? 0) + 1}/${shown.provider === "elevenlabs" ? 1 : 5} · attempt ${shown.attempts?.at(-1)?.number ?? 1}/${shown.provider === "elevenlabs" ? 1 : 3} · ${elapsed}s elapsed` : '';
  $('generation-prompt').textContent = shown?.input.request.prompt ?? ''; $('generation-error').textContent = shown?.error || shown?.status === 'failed' ? 'Generation did not complete. Any saved audio remains available below.' : '';
  $('active-link').hidden = !active || view === 'listen'; $('cancel-generation').hidden = !active; $('cancel-generation').disabled = active?.status === 'canceling';
  $('cancel-generation').onclick = () => runButton($('cancel-generation'), async () => { await api(`jobs/${active.id}/cancel`, {}); await refresh(); });
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
  const ready = await api('readiness'); readiness = ready;
  const text = `${ready.generation === 'fixture' ? 'Synthetic test workspace' : ready.generation === 'setup_required' ? 'Local models will be prepared before generation' : 'Local Stable Audio ready'} · ElevenLabs ${ready.elevenlabs === 'configured' ? 'key configured' : 'key required for recreation'}`;
  $('readiness').textContent = text; $('settings-readiness').textContent = text;
}
async function refresh() {
  const [nextJobs, nextCandidates, nextSelections, nextBatches] = await Promise.all([api('jobs'), api('candidates'), api('selections'), api('batches'), refreshQa()]);
  batchReviews = nextBatches;
  selections = nextSelections;
  const changed = JSON.stringify(candidates) !== JSON.stringify(nextCandidates); jobs = nextJobs; candidates = nextCandidates; takes = groupTakes(candidates, jobs);
  if (changed) { await loadFeedback(); renderLibrary(); }
  renderReviewBatch(); renderGeneration();
  renderBatch(); renderLibrary(); renderDiagnostics();
  const signature = JSON.stringify(jobs); if ($('jobs').dataset.signature === signature) return;
  $('jobs').dataset.signature = signature; $('jobs').replaceChildren();
  if (!jobs.length) node('p', 'No requests yet.', $('jobs'));
  for (const job of [...jobs].reverse()) { const box = node('article', undefined, $('jobs'), { class: 'job' }); node('h3', job.input.request.prompt, box); node('p', `${job.status} · ${job.progress ?? 'queued'} · ${job.provider ?? "historical"}`, box); const details = node('details', undefined, box); node('summary', 'Details', details); node('pre', JSON.stringify(job, null, 2), details); const id = job.result?.candidate_sha256 ?? job.candidate_ids.at(-1); if (id) button('Open saved take', box, async () => { currentJob = job.id; await select(id); navigate('listen'); }, local); if (job.status === 'interrupted') button('Open recovery', box, () => { currentJob = job.id; renderGeneration(); navigate('listen'); }, local); }
}
function newTakeInput(job) { const request = { ...job.input.request }; delete request.seed; delete request.loop; return { request, provider: 'local', sound_parent_id: job.id }; }
async function anotherTake(take) { if (submitting || jobs.some(j => ['running', 'canceling'].includes(j.status))) { say('Wait for this batch or cancel it first.'); return; } const input = take.job ? newTakeInput(take.job) : { request: { prompt: title(take.records[0]), duration_seconds: take.records[0].evidence.generation.request.duration_seconds }, provider: 'local' }; await submitInput(input, `another-${take.id}`); }
function recreateButton(c, parent) {
  const item = reviewItem(c), batchId = reviewBatchId, id = c.candidate_sha256;
  const b = button('Generate with ElevenLabs', parent, async () => { if (item) await batchMutation({ path: `batches/${batchId}/sounds/${item.key}/recreate`, input: { candidate_sha256: id }, key: uid() }); else await recreate(c); });
  b.dataset.pendingKey = 'recreate-' + id; b.dataset.recreate = id;
  node('p', '', parent, { class: 'hint', 'data-recreate-reason': id }); updateRecreate();
}
function updateRecreate() {
  for (const b of document.querySelectorAll('[data-recreate]')) {
    const c = candidates.find(c => c.candidate_sha256 === b.dataset.recreate); if (!c) continue;
    const queued = pendingButtons.has('recreate-' + c.candidate_sha256) || batchReviews.some(batch => batch.sounds.some(sound => sound.operations.some(o => o.input.recreation_parent === c.candidate_sha256 && ['queued','paused','running','canceling'].includes(o.status)))) || jobs.some(j => j.input.recreation_parent === c.candidate_sha256 && ['queued','running','canceling'].includes(j.status));
    const reason = c.evidence.generation.request.duration_seconds > 30 ? 'ElevenLabs supports at most 30 seconds.' : readiness.elevenlabs !== 'configured' ? 'Configure an ElevenLabs key in Settings to generate.' : queued ? 'An equivalent ElevenLabs request is already pending.' : '';
    if (!b.hasAttribute('aria-busy')) b.disabled = Boolean(reason);
    b.parentElement.querySelector('[data-recreate-reason]').textContent = reason || 'Makes a new rendition from the prompt; your current clip and winner stay saved.';
  }
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
  const item = batchReviews.find(b => b.id === reviewBatchId)?.sounds.find(s => s.key === reviewSoundKey);
  const sound = item?.sound_id ?? takeFor(selected)?.sound ?? jobs.find(j => j.id === currentJob)?.sound_id;
  const box = $('batch-results'); if (!sound) return;
  if (box.dataset.sound !== sound) { closeEditor(); box.querySelectorAll('audio').forEach(p => p.pause()); box.replaceChildren(); box.dataset.sound = sound; }
  $('empty').hidden = true; $('sound-title').textContent = soundName(sound);
  if ($('sound-actions').dataset.sound !== sound) {
    const actions = $('sound-actions'); actions.dataset.sound = sound; actions.replaceChildren();
    if (!item) { const take = takes.find(t => t.sound === sound); if (take) button('Generate more', actions, () => anotherTake(take)); button('Edit prompt', actions, () => { const c = takes.find(t => t.sound === sound)?.records[0]; if (c) { $('prompt').value = c.evidence.generation.request.prompt; $('duration').value = c.evidence.generation.request.duration_seconds; $('loop').checked = [...jobs].filter(j => j.sound_id === sound || j.id === sound).sort((a,b) => a.started_at.localeCompare(b.started_at)).at(-1)?.input.request.loop === true; remember('loop', $('loop').checked); } composeParent = takes.find(t => t.sound === sound)?.job?.id; navigate('create'); $('prompt').focus(); }, local); }
  }
  const winner = selections.find(s => s.sound_id === sound)?.candidate_sha256;
  let best = box.querySelector('[data-best]'); if (!best) best = node('section', undefined, box, { 'data-best': '', class: 'selected-winner' });
  const winnerRecord = candidates.find(c => c.candidate_sha256 === winner);
  if (best.dataset.id !== (winner ?? '')) {
    best.dataset.id = winner ?? '';
    const heading = best.querySelector('h3') ?? node('h3', 'Selected winner', best); heading.hidden = !winner;
    if (winnerRecord) { const row = node('article', undefined, best, { class: 'clip-row' }); heading.after(row); renderClip(winnerRecord, row, true); }
  }
  for (const row of best.querySelectorAll('[data-clip]')) {
    if (row.dataset.clip === winner) { row.querySelector('.previous-winner')?.remove(); continue; }
    const active = row.contains(document.activeElement) || [...row.querySelectorAll('audio')].some(p => !p.paused) || row.querySelector('details[open]');
    if (!active) row.remove();
    else if (!row.querySelector('.previous-winner')) node('p', 'Previously selected · kept open while you listen or review.', row, { class: 'previous-winner hint' });
  }
  const groups = item ? item.operations.map(o => ({ ...o, job: jobs.find(j => j.id === o.job_id) })) : jobs.filter(j => (j.sound_id ?? j.id) === sound).sort((a,b) => a.started_at.localeCompare(b.started_at)).map(j => ({ job_id: j.id, input: j.input, status: j.status, job: j }));
  for (const job of jobs.filter(j => (j.sound_id ?? j.id) === sound)) if (!groups.some(g => g.job_id === job.id)) groups.push({ job_id: job.id, input: job.input, status: job.status, job });
  for (const take of takes.filter(t => t.sound === sound && !t.job)) groups.push({ job_id: take.id, status: 'completed' });
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index], id = group.job_id;
    let details = box.querySelector(`[data-generation="${id}"]`);
    if (!details) { details = node('details', undefined, box, { class: 'generation-group', 'data-generation': id }); details.open = index === groups.length - 1; details.addEventListener('click', event => { if (event.target.closest('summary')) details.dataset.manual = 'true'; }); details.addEventListener('keydown', event => { if (event.target.tagName === 'SUMMARY' && ['Enter', ' '].includes(event.key)) details.dataset.manual = 'true'; }); node('summary', '', details); node('p', '', details, { class: 'group-status', role: 'status' }); const after = index === groups.length - 1 ? best : box.querySelector(`[data-generation="${groups[index + 1].job_id}"]`); after.after(details); }
    if (!details.dataset.manual) details.open = index === groups.length - 1;
    const groupTakes = takes.filter(t => (t.job?.id ?? t.id) === id), provider = (group.job?.provider ?? group.input?.provider) === 'elevenlabs' ? 'ElevenLabs' : 'Local';
    const contains = groupTakes.some(t => t.records.some(c => c.candidate_sha256 === winner));
    const state = ['queued', 'paused'].includes(group.status) ? 'Queued' : ['running','canceling'].includes(group.status) ? 'Generating' : ['failed','interrupted'].includes(group.status) ? 'Failed' : 'Ready';
    const clipCount = group.job?.variants?.length ?? groupTakes.length;
    details.querySelector('summary').textContent = `Generation ${index + 1} · ${provider} · ${clipCount} clip${clipCount === 1 ? '' : 's'} · ${index === groups.length - 1 ? 'Latest' : 'Earlier generation'}${contains ? ' · Contains selected winner' : ''}`;
    details.querySelector('.group-status').textContent = state + (state === 'Failed' ? '. Generate more or check Settings diagnostics.' : '');
    for (const take of groupTakes) {
      let row = details.querySelector(`[data-take="${take.id}"]`);
      if (!row) { row = node('article', undefined, details, { class: 'clip-row', 'data-take': take.id }); renderClip(preferred(take), row); }
      const count = String(take.versions.length);
      if ((row.dataset.versionCount !== count || row.dataset.preferred !== (take.preferred?.candidate_sha256 ?? '')) && !row.contains(document.activeElement) && !row.querySelector('.trim-editor') && ![...row.querySelectorAll('audio')].some(p => !p.paused)) { const shown = row.dataset.manualVersion ? candidates.find(c => c.candidate_sha256 === row.dataset.clip) ?? preferred(take) : preferred(take); row.replaceChildren(); renderClip(shown, row); row.dataset.versionCount = count; }
      // Existing rows retain their player, focus, drafts and manually chosen saved version.
    }
  }
  updateSelected(); updateRecreate();
}
function reviewItem(c) { return batchReviews.find(b => b.id === reviewBatchId)?.sounds.find(s => s.sound_id === takeFor(c.candidate_sha256)?.sound); }
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
  if (reviewSoundKey !== key || $('batch-results').dataset.sound !== batchReviews.find(b => b.id === reviewBatchId)?.sounds.find(s => s.key === key)?.sound_id) { closeEditor(); document.querySelectorAll('audio').forEach(p => p.pause()); }
  reviewSoundKey = key; remember('batch-sound-' + reviewBatchId, key); renderReviewBatch();
  const sound = batchReviews.find(b => b.id === reviewBatchId)?.sounds.find(s => s.key === key);
  selected = sound?.selection?.candidate_sha256 ?? takes.find(t => t.sound === sound?.sound_id)?.records[0]?.candidate_sha256;
  currentJob = sound?.operations.at(-1)?.job_id; renderGeneration(); renderBatch();
}
function renderReviewBatch() {
  const list = $('review-batches'), signature = JSON.stringify(batchReviews.map(b => [b.id,b.name,b.status,b.progress]));
  if (list.dataset.signature !== signature) { list.dataset.signature = signature; list.replaceChildren(); if (batchReviews.length) node('h2', 'Batch reviews', list); for (const b of batchReviews) button(`${b.name} · ${b.progress.selected}/${b.progress.total} selected`, list, async () => { reviewSoundKey = undefined; navigate('batch/' + b.id); await openReviewSound($('batch-sound').value); }, local); }
  const batch = batchReviews.find(b => b.id === reviewBatchId), box = $('review-batch');
  box.hidden = !reviewBatchId; document.body.classList.toggle('reviewing-batch', Boolean(reviewBatchId)); if (!reviewBatchId) return;
  $('batch-title').textContent = batch?.name ?? 'Loading batch…'; if (!batch) { $('batch-error').textContent = 'Batch not loaded. Reconnect if it does not appear.'; return; }
  if (box.dataset.id !== reviewBatchId) { box.dataset.id = reviewBatchId; reviewSoundKey = recall('batch-sound-' + reviewBatchId, null); }
  const sound = batch.sounds.find(s => s.key === reviewSoundKey) ?? batch.sounds[0]; reviewSoundKey = sound.key;
  $('batch-progress').textContent = `${batch.progress.selected} of ${batch.progress.total} sounds selected`;
  $('batch-error').textContent = batch.queue_error ? 'The queue needs attention. Check Settings diagnostics.' : sound.operations.at(-1)?.error ? 'Generation failed. Try generating this sound again.' : '';
  const focusedSound = $('sound-list').contains(document.activeElement) ? document.activeElement.dataset.soundKey : null;
  const choices = $('batch-sound'), choicesSignature = JSON.stringify(batch.sounds.map(s => [s.key,s.status,Boolean(s.selection)]));
  if (choices.dataset.signature !== choicesSignature) { choices.dataset.signature = choicesSignature; choices.replaceChildren(); $('sound-list').replaceChildren(); for (const s of batch.sounds) { const state = s.selection ? 'Selected' : s.status === 'generating' ? 'Generating' : s.status === 'needs_attention' ? 'Failed' : 'Needs selection'; const label = `${soundName(s.sound_id)} · ${state}`; node('option', label, choices, { value: s.key }); const b = button(label, $('sound-list'), () => openReviewSound(s.key), local); b.dataset.soundKey = s.key; } }
  choices.value = sound.key; for (const b of $('sound-list').querySelectorAll('button')) { b.setAttribute('aria-current', String(b.dataset.soundKey === sound.key)); if (focusedSound === b.dataset.soundKey && document.activeElement !== b) b.focus({ preventScroll: true }); }
  currentJob = sound.operations.at(-1)?.job_id;
  const editorKey = reviewBatchId + ':' + sound.key;
  if ($('batch-edit').dataset.key !== editorKey) { $('batch-edit').dataset.key = editorKey; const value = recall('batch-edit-' + editorKey, sound.operations.at(-1)?.input.request ?? sound.original_request); $('batch-prompt').value = value.prompt; $('batch-duration').value = String(value.duration_seconds); $('batch-loop').checked = value.loop === true; }
  $('batch-regenerate').disabled = $('batch-regenerate').hasAttribute('aria-busy') || !jobs.some(j => j.id === sound.sound_id);
  $('batch-generate-more').disabled = $('batch-generate-more').hasAttribute('aria-busy') || $('batch-regenerate').disabled;
  $('batch-generation-readiness').textContent = !jobs.some(j => j.id === sound.sound_id) ? 'Generation controls become available when this sound’s first request starts.' : '';
  const pending = batch.sounds.some(s => s.operations.some(o => ['queued','running','canceling','paused'].includes(o.status)));
  $('batch-pause').hidden = !pending && !batch.paused; if (!$('batch-pause').hasAttribute('aria-busy')) $('batch-pause').textContent = batch.paused ? 'Resume queued work' : 'Pause queue after current sound';
  $('batch-pause').onclick = () => runButton($('batch-pause'), async () => { await api(`batches/${batch.id}/${batch.paused ? 'resume' : 'pause'}`, {}); await refresh(); });
  const complete = batch.progress.selected === batch.progress.total;
  $('batch-complete').hidden = !complete; $('batch-next').hidden = complete;
  const next = batch.sounds.find(s => !s.selection && s.key !== sound.key); $('batch-next').disabled = !next; $('batch-next').textContent = next ? 'Next sound needing a choice' : 'Select a winner for this sound'; $('batch-next').onclick = () => { if (next) openReviewSound(next.key); };
  $('batch-export').hidden = !complete; $('batch-export').disabled = $('batch-export').hasAttribute('aria-busy') || batch.status !== 'ready'; $('batch-export').title = batch.status !== 'ready' ? 'Wait for queued generation to finish before exporting.' : '';
  $('batch-complete').textContent = batch.paused ? 'All sounds selected. Resume queued work to enable export.' : batch.status !== 'ready' ? 'All sounds selected. Export is available when queued work finishes.' : 'All sounds selected';
  $('batch-export').onclick = () => runButton($('batch-export'), async () => { const manifest = await api(`batches/${batch.id}/winners`); for (const item of manifest.sounds) await download(candidates.find(c => c.candidate_sha256 === item.candidate_sha256)); const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })); const a = node('a', undefined, document.body, { href: url, download: 'winners.json' }); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); });
}
$('batch-sound').onchange = () => openReviewSound($('batch-sound').value);
for (const id of ['batch-prompt','batch-duration','batch-loop']) $(id).addEventListener('input', () => remember('batch-edit-' + $('batch-edit').dataset.key, { prompt: $('batch-prompt').value, duration_seconds: Number($('batch-duration').value), loop: $('batch-loop').checked }));
const generateMore = b => {
  const pending = { path: `batches/${reviewBatchId}/sounds/${reviewSoundKey}/regenerate`, input: { prompt: $('batch-prompt').value, duration_seconds: Number($('batch-duration').value), loop: $('batch-loop').checked }, key: uid() };
  b.dataset.pendingKey = JSON.stringify([pending.path, pending.input]);
  return runButton(b, () => batchMutation(pending));
};
$('batch-edit').onsubmit = event => { event.preventDefault(); generateMore($('batch-regenerate')); };
$('batch-generate-more').onclick = () => generateMore($('batch-generate-more'));
async function submitInput(input, intent) {
  if (submitting) return; const requestedView = view; submitting = true; $('compose-error').textContent = ''; renderGeneration();
  const previous = recall('submission', null); const pending = previous ?? { key: uid(), input, intent }; remember('submission', pending);
  try { const job = await api('jobs', pending.input, pending.key); localStorage.removeItem('studio-submission'); currentJob = job.id; remember('current-job', job.id); jobs = [job, ...jobs.filter(j => j.id !== job.id)]; submitting = false; if (view === requestedView && ['create', 'listen'].includes(view)) navigate('listen'); await refresh(); if (!['running', 'canceling'].includes(job.status) && job.result?.candidate_sha256) await select(job.result.candidate_sha256); say('Request saved. Refresh safely to reconnect.'); }
  catch (error) { if ([400, 403, 409, 415, 422, 429].includes(error.status)) localStorage.removeItem('studio-submission'); $('compose-error').textContent = error.message; $('generation-error').textContent = error.message; throw error; } finally { submitting = false; renderGeneration(); }
}
$('compose').onsubmit = event => { event.preventDefault(); if ($('generate').disabled) return;
  const prompt = [$('prompt').value, $('events').value ? `Intended event count: ${$('events').value}.` : '', $('constraints').value.trim() ? `Constraints: ${$('constraints').value.trim()}` : ''].filter(Boolean).join('\n');
  const input = { provider: 'local', ...(composeParent ? { sound_parent_id: composeParent } : {}), request: { prompt, duration_seconds: Number($('duration').value), loop: $('loop').checked, ...($('seed').value ? { seed: Number($('seed').value) } : {}) } };
  submitting = true; renderGeneration(); action(async () => { submitting = false; await submitInput(input, 'compose'); });
};
async function connect() {
  const response = await fetch('/studio/session', { headers: { 'X-Studio-Bootstrap': '1' } }); if (!response.ok) throw new Error('Local session unavailable'); csrf = (await response.json()).csrf;
  currentJob = recall('current-job', null); await refresh(); await loadFeedback(); renderLibrary();
  const id = recall('selected', null); if (!reviewBatchId && candidates.some(c => c.candidate_sha256 === id)) await select(id);
  const next = location.hash.slice(1) || recall('view', 'create'); navigate(next, false); if (reviewBatchId) await openReviewSound($('batch-sound').value); $('reconnect').hidden = true; say('Connected · saved locally');
  const batchPending = recall('batch-submission', null); if (batchPending) await batchMutation(batchPending);
  const pending = recall('submission', null); if (pending) await submitInput(pending.input, pending.intent);
  else { const job = jobs.find(j => j.id === currentJob); if (!selected && view === 'listen' && job?.result?.candidate_sha256) await select(job.result.candidate_sha256); }
}
$('reconnect').onclick = () => runButton($('reconnect'), connect);
renderLibrary(); action(connect); setInterval(() => { if (!busy && csrf) action(refresh); }, 2000);
