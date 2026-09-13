const $ = id => document.getElementById(id);
const uid = () => crypto.randomUUID().replaceAll('-', '');
let pendingAction = Promise.resolve();
let csrf, candidates = [], jobs = [], takes = [], selected, busy = false, submitting = false, currentJob, submissionPrompt = '', submissionError = '';
let libraryEntries = [];
let batchReviews = [], reviewBatchId = /^#batch\/([a-f0-9]{32})$/.exec(location.hash)?.[1] ?? null, reviewSoundKey;
let view = 'create', feedback = new Map(), selections = [], readiness = {}, editorId, composeParent;
const say = message => { if ($('status').textContent !== message) $('status').textContent = message; };
function remember(key, value) { localStorage.setItem('studio-' + key, JSON.stringify(value)); }
function recall(key, fallback) { try { return JSON.parse(localStorage.getItem('studio-' + key)) ?? fallback; } catch { return fallback; } }
let youtube;
const youtubeKey = (batch, sound) => `youtube-${batch}:${sound}`;
function unloadYoutube() { $('youtube-player').replaceChildren(); }
function closeYoutube() {
  if (!$('youtube-dialog').open) return;
  saveYoutubeDraft(); unloadYoutube(); $('youtube-dialog').close(); youtube = undefined;
  if ($('batch-youtube').getClientRects().length) $('batch-youtube').focus({ preventScroll: true });
}
function saveYoutubeDraft(changedInterval = false) {
  if (!youtube) return;
  const draft = youtube.draft;
  Object.assign(draft, { query: $('youtube-query').value, url: $('youtube-url').value, start: $('youtube-start').value, end: $('youtube-end').value });
  if (changedInterval && ['failed', 'canceled'].includes(youtubeOperation(youtube)?.status)) delete draft.pending;
  remember(youtube.key, draft);
}
function youtubeOperation(context) {
  const sound = batchReviews.find(b => b.id === context.batch)?.sounds.find(s => s.key === context.sound);
  return sound?.operations.find(o => o.idempotency_key === context.draft.pending?.key);
}
function pauseForYoutube() {
  stopLoopPreview(); document.querySelector('.trim-editor')?.playback?.pause();
  document.querySelectorAll('audio').forEach(player => player.pause());
}
function playYoutube(url, autoplay = false) {
  const parsed = new URL(url); let id;
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.searchParams.has('list')) throw new Error('Use one HTTPS YouTube video.');
  if (parsed.hostname === 'youtu.be') id = parsed.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(parsed.hostname)) id = parsed.pathname === '/watch' ? parsed.searchParams.get('v') : parsed.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})\/?$/)?.[1];
  if (!/^[\w-]{11}$/.test(id ?? '')) throw new Error('Enter a valid YouTube video URL.');
  pauseForYoutube(); unloadYoutube();
  node('iframe', undefined, $('youtube-player'), { src: `https://www.youtube.com/embed/${id}?autoplay=${autoplay ? 1 : 0}`, title: 'YouTube video audition', referrerpolicy: 'strict-origin-when-cross-origin', allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: '' });
  $('youtube-url').value = `https://www.youtube.com/watch?v=${id}`;
  $('youtube-external').href = $('youtube-url').value; $('youtube-external').hidden = false;
  saveYoutubeDraft(true);
}
function openYoutube() {
  if (!batchReviews.find(b => b.id === reviewBatchId)?.sounds.some(s => s.key === reviewSoundKey)) return;
  closeYoutube(); pauseForYoutube();
  const batch = reviewBatchId, sound = reviewSoundKey, key = youtubeKey(batch, sound);
  const draft = recall(key, { query: $('batch-prompt').value.slice(0, 300), url: '', start: '0', end: '5' });
  const pending = batchReviews.find(b => b.id === batch)?.sounds.find(s => s.key === sound)?.operations.findLast(o => o.input.provider === 'youtube' && ['queued','paused','running','canceling','interrupted'].includes(o.status));
  if (!draft.pending && pending) {
    draft.pending = { key: pending.idempotency_key, input: pending.input.import, job_id: pending.job_id };
    Object.assign(draft, { url: pending.input.import.url, start: String(pending.input.import.start_seconds), end: String(pending.input.import.end_seconds) });
  }
  youtube = { batch, sound, key, draft, submitting: false, searching: false };
  remember(key, draft);
  $('youtube-target').textContent = sound.replaceAll('_', ' ').replaceAll('-', ' ');
  for (const [id, value] of Object.entries({ query: draft.query, url: draft.url, start: draft.start, end: draft.end })) $('youtube-' + id).value = value ?? '';
  $('youtube-results').replaceChildren(); $('youtube-error').textContent = draft.error ?? ''; $('youtube-external').hidden = true;
  $('youtube-search').disabled = false; $('youtube-dialog').showModal(); updateYoutube(); $('youtube-query').focus();
}
function updateYoutube() {
  if (!youtube) return;
  const ready = readiness.youtube;
  $('youtube-readiness').textContent = ready?.ready ? 'YouTube import ready' : ready?.error ?? ready?.tools?.filter(t => t.error).map(t => `${t.name}: ${t.error}`).join(' · ') ?? 'Checking YouTube tools…';
  const op = youtubeOperation(youtube), job = jobs.find(j => j.id === op?.job_id);
  const pending = youtube.draft.pending;
  const active = pending && (!op || ['queued','paused','running','canceling','interrupted'].includes(op.status));
  $('youtube-add').disabled = youtube.submitting || Boolean(op && active) || !ready?.ready;
  $('youtube-add').textContent = youtube.submitting ? 'Submitting…' : pending && !op ? 'Retry acceptance' : op?.status === 'failed' ? 'Retry import' : 'Add audio to this sound';
  for (const id of ['url','start','end']) $('youtube-' + id).disabled = Boolean(active) || youtube.submitting;
  $('youtube-cancel').hidden = !op || !['queued','paused','running','canceling'].includes(op.status);
  $('youtube-cancel').disabled = op?.status === 'canceling';
  $('youtube-progress').textContent = op ? `${op.status === 'running' ? 'Importing audio' : op.status} · ${job?.progress ?? 'Waiting for the batch queue'}${job && ['running','canceling'].includes(job.status) ? ' · ' + Math.floor((Date.now() - Date.parse(job.started_at)) / 1000) + 's elapsed' : ''}` : youtube.submitting ? 'Saving import request…' : pending ? 'Acceptance uncertain. Retry with the same request to reconnect safely.' : youtube.searching ? 'Searching YouTube…' : '';
  $('youtube-error').textContent = op?.error ?? youtube.draft.error ?? '';
}
function syncYoutube() {
  for (const batch of batchReviews) for (const sound of batch.sounds) {
    const key = youtubeKey(batch.id, sound.key), draft = recall(key, null);
    if (!draft?.pending) continue;
    const op = sound.operations.find(o => o.idempotency_key === draft.pending.key);
    if (!op) continue;
    draft.pending.job_id = op.job_id;
    if (op.status === 'completed') {
      delete draft.pending; delete draft.error; remember(key, draft);
      const matching = youtube?.key === key;
      if (matching) { youtube.draft = draft; closeYoutube(); }
      if (matching && reviewBatchId === batch.id && reviewSoundKey === sound.key) {
        const group = $('batch-results').querySelector(`[data-generation="${op.job_id}"]`);
        if (group) { group.open = true; group.dataset.manual = 'true'; group.scrollIntoView({ block: 'nearest' }); }
      }
      say(`YouTube audio added to ${sound.key.replaceAll('_', ' ')}.`);
    } else { remember(key, draft); if (youtube?.key === key) youtube.draft = draft; }
  }
  updateYoutube();
}
$('batch-youtube').onclick = openYoutube;
$('youtube-close').onclick = closeYoutube;
$('youtube-dialog').addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeYoutube(); } });
$('youtube-dialog').addEventListener('cancel', event => { event.preventDefault(); closeYoutube(); });
$('youtube-dialog').addEventListener('click', event => {
  if (event.target !== $('youtube-dialog')) return;
  const rect = event.target.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeYoutube();
});
for (const id of ['query','url','start','end']) $('youtube-' + id).addEventListener('input', () => { saveYoutubeDraft(id !== 'query'); updateYoutube(); });
$('youtube-url').addEventListener('change', () => { if (!$('youtube-url').value) return; try { playYoutube($('youtube-url').value); } catch (error) { $('youtube-error').textContent = error.message; } });
$('youtube-search-form').onsubmit = async event => {
  event.preventDefault(); const context = youtube; if (!context || context.searching) return;
  saveYoutubeDraft(); delete context.draft.error; remember(context.key, context.draft); context.searching = true; $('youtube-search').disabled = true; $('youtube-error').textContent = ''; $('youtube-progress').textContent = 'Searching YouTube…';
  try {
    const result = await api('youtube/search', { query: context.draft.query });
    if (youtube !== context) return;
    $('youtube-results').replaceChildren();
    for (const entry of result.results) {
      const row = node('div', undefined, $('youtube-results'), { class: 'youtube-result' }); node('span', entry.title, row);
      button('Play here', row, () => { if (youtube === context) playYoutube(entry.url, true); }, local);
    }
    if (result.results[0]) playYoutube(result.results[0].url);
    else node('p', 'No results. Try another query.', $('youtube-results'));
  } catch (error) { if (youtube === context) { context.draft.error = error.message; remember(context.key, context.draft); $('youtube-error').textContent = error.message; } }
  finally { context.searching = false; if (youtube === context) { $('youtube-search').disabled = false; updateYoutube(); } }
};
$('youtube-import-form').onsubmit = async event => {
  event.preventDefault(); const context = youtube; if (!context || context.submitting) return;
  saveYoutubeDraft(); const op = youtubeOperation(context);
  if (op && ['queued','paused','running','canceling','interrupted'].includes(op.status)) return;
  if (op?.status === 'canceled') delete context.draft.pending;
  context.draft.pending ??= { key: uid(), input: { url: context.draft.url, start_seconds: Number(context.draft.start), end_seconds: Number(context.draft.end) } };
  delete context.draft.error; remember(context.key, context.draft); context.submitting = true; updateYoutube();
  try {
    if (op?.status === 'failed') await api(`jobs/${op.job_id}/recover`, {});
    else await api(`batches/${context.batch}/sounds/${context.sound}/youtube`, context.draft.pending.input, context.draft.pending.key);
    await refresh();
  } catch (error) {
    const draft = recall(context.key, context.draft); draft.error = error.message;
    if (error.status >= 400 && error.status < 500 && !op) delete draft.pending;
    remember(context.key, draft); context.draft = draft;
  } finally { context.submitting = false; if (youtube === context) updateYoutube(); }
};
$('youtube-cancel').onclick = async () => {
  const context = youtube, op = context && youtubeOperation(context); if (!op) return;
  $('youtube-cancel').disabled = true;
  try { await api(`jobs/${op.job_id}/cancel`, {}); await refresh(); }
  catch (error) { if (youtube === context) { context.draft.error = error.message; updateYoutube(); } }
};

$('loop').checked = recall('loop', false) === true;
$('loop').addEventListener('change', () => remember('loop', $('loop').checked));
const drafts = ['prompt', 'constraints', 'events', 'duration', 'seed'];
for (const id of drafts) { $(id).value = recall(id, $(id).value); $(id).addEventListener($(id).tagName === 'SELECT' ? 'change' : 'input', () => remember(id, $(id).value)); }
if (!$('duration').value) { $('duration').value = '5'; remember('duration', '5'); }
localStorage.removeItem('studio-comparison'); localStorage.removeItem('studio-compare-scope');
async function api(path, value, key, method) {
  const response = await fetch('/studio/' + path, { method: method ?? (value === undefined ? 'GET' : 'POST'), headers: { 'Content-Type': 'application/json', 'X-Studio-CSRF': csrf, ...(key ? { 'Idempotency-Key': key } : {}) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
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
    finally { pendingButtons.delete(key); b.disabled = false; b.removeAttribute('aria-busy'); b.textContent = label; b.style.minWidth = minWidth; updateSelected(); updateRecreate(); updateLibraryButtons(); if (['batch-pause', 'batch-export', 'batch-regenerate', 'batch-generate-more'].includes(b.id)) renderReviewBatch(); if (b.id === 'cancel-generation') renderGeneration(); }
  });
}
const local = operation => operation();
function title(c) { if (!c) return 'Sound'; return c.evidence.generation.prompt_plan?.intent ?? c.evidence.generation.request.prompt; }
function formatDuration(seconds) {
  if (seconds > 0 && seconds < 0.000001) return '<0.001 ms';
  if (seconds < 1) return `${Number((seconds * 1000).toFixed(3))} ms`;
  return `${seconds.toFixed(3)} s`;
}
function groupTakes(records, requests) {
  const groups = new Map();
  const root = job => { const seen = new Set(); while (!job?.sound_id && job?.parent_id && !seen.has(job.id)) { seen.add(job.id); const parent = requests.find(j => j.id === job.parent_id); if (!parent) break; job = parent; } return job?.sound_id ?? job?.id; };
  const ordered = [...requests].sort((a,b) => (a.started_at ?? '').localeCompare(b.started_at ?? '') || a.id.localeCompare(b.id));
  for (const c of records) {
    if (c.evidence.generation.runtime?.backend === 'youtube' && !c.evidence.cut) continue;
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
    take.number = 1 + (take.job?.variants ? take.variant : legacyIndex) + preceding.reduce((n,j) => n + (j.provider === 'youtube' ? result.filter(t => t.job === j).length : j.variants?.length ?? (result.filter(t => t.job === j).length || 1)), 0);
    take.preferred = take.records.find(c => c.candidate_sha256 === take.job?.variants?.find(v => v.index === take.variant)?.result?.candidate_sha256) ?? take.records.find(c => c.candidate_sha256 === take.job?.result?.candidate_sha256) ?? take.records.find(c => take.job?.attempts?.some(a => a.result?.candidate_sha256 === c.candidate_sha256));
    const versions = new Map();
    for (const c of take.records) { const cut = c.evidence.cut; const key = cut ? JSON.stringify([cut.audio_sha256, cut.id, cut.bounds]) : c.evidence.generation.id; if (!versions.has(key)) versions.set(key, []); versions.get(key).push(c); }
    const named = [];
    for (const records of versions.values()) {
      const c = records.find(c => c === take.preferred) ?? records[0], cut = c.evidence.cut;
      const automatic = records.includes(take.preferred);
      let name = 'Original';
      if (cut) {
        const rate = cut.bounds.sample_rate;
        const scope = cut.loop ? `Loop ${formatDuration((cut.loop.output_frames ?? (cut.bounds.end_sample - cut.bounds.start_sample)) / rate)}` : `Trim ${formatDuration(cut.bounds.start_sample / rate)}–${formatDuration(cut.bounds.end_sample / rate)}`;
        name = automatic ? `Automatic · ${scope}` : scope;
      }
      named.push({ records, candidate: c, name, automatic, at: cut?.started_at ?? '' });
    }
    let edits = 0;
    take.versions = named.sort((a, b) => a.at.localeCompare(b.at) || (a.candidate.evidence.cut?.id ?? '').localeCompare(b.candidate.evidence.cut?.id ?? '')).map(v => { if (!v.automatic && v.candidate.evidence.cut) v.name = `Edit ${++edits} · ${v.name}`; return v; });
  }
  return result;
}
const takeFor = id => takes.find(t => t.records.some(c => c.candidate_sha256 === id));
const versionFor = (take, id) => take.versions.find(v => v.records.some(c => c.candidate_sha256 === id));
const sourceLabel = provider => provider === 'youtube' ? 'YouTube' : provider === 'elevenlabs' ? 'ElevenLabs' : 'Local';
const identity = c => { const take = takeFor(c.candidate_sha256); return `${soundName(take.sound)} · Clip ${take.number} · ${sourceLabel(take.job?.provider ?? c.evidence.generation.runtime?.backend)} · ${formatDuration(clipDuration(c))}${c.evidence.cut ? ' · ' + versionFor(take, c.candidate_sha256).name : ''}`; };
function preferred(take) { const remembered = recall('version-' + take.id, null) ?? take.records.map(c => recall('version-' + c.evidence.generation.id, null)).find(Boolean); return take.records.find(c => c.candidate_sha256 === selections.find(s => s.sound_id === take.sound)?.candidate_sha256) ?? take.records.find(c => c.candidate_sha256 === remembered) ?? take.preferred ?? take.records.find(c => c.evidence.cut) ?? take.records[0]; }
const clipDuration = c => c.evidence.cut ? (c.evidence.cut.loop?.output_frames ?? (c.evidence.cut.bounds.end_sample - c.evidence.cut.bounds.start_sample)) / c.evidence.cut.bounds.sample_rate : c.evidence.generation.audio.seconds;
function soundName(sound) { const item = batchReviews.flatMap(b => b.sounds).find(s => s.sound_id === sound); return item ? item.key.replaceAll('_', ' ').replaceAll('-', ' ') : title(takes.find(t => t.sound === sound)?.records[0]).split('\n')[0]; }
let loopPlayer;
function stopLoopPreview() { loopPlayer?.pause(); loopPlayer = undefined; }
function closeEditor() { stopLoopPreview(); if (!editorId) return; const editor = document.querySelector('.trim-editor'); editor?.dispose?.(); editor?.querySelectorAll('audio').forEach(a => a.pause()); editor?.remove(); editorId = undefined; }
function audio(c, parent, label, source = false) {
  const player = node('audio', undefined, parent, { controls: '', preload: 'metadata', 'aria-label': label, src: `/studio/candidates/${c.candidate_sha256}/${source || !c.evidence.cut ? 'source' : 'audio'}` });
  player.addEventListener('play', () => { unloadYoutube(); stopLoopPreview(); document.querySelector('.trim-editor')?.playback?.pause(); document.querySelectorAll('audio').forEach(other => { if (other !== player) other.pause(); }); if (editorId && editorId !== c.candidate_sha256) closeEditor(); });
  player.addEventListener('canplay', () => parent.querySelector('.playback-error')?.remove());
  player.addEventListener('error', () => { let error = parent.querySelector('.playback-error'); if (!error) error = node('p', '', parent, { class: 'playback-error error', role: 'status' }); error.textContent = 'Audio could not load. Reconnect and replay this clip.'; });
  return player;
}
function saveLocation() { history.replaceState({ ...history.state, selected, scroll: scrollY }, ''); }
function navigate(next, push = true) {
  if (youtube && next !== 'batch/' + youtube.batch && next !== 'listen') closeYoutube();
  if (reviewBatchId && next === 'listen') next = 'batch/' + reviewBatchId;
  if (push) { saveLocation(); history.pushState({ selected, scroll: 0 }, '', '#' + next); }
  const batchMatch = /^batch\/([a-f0-9]{32})$/.exec(next);
  if (next === 'compare') next = 'listen';
  reviewBatchId = batchMatch?.[1] ?? (next === 'listen' ? reviewBatchId : null);
  if (batchMatch) next = 'listen';
  renderReviewBatch();
  view = ['create', 'listen', 'library', 'history', 'settings'].includes(next) ? next : 'create';
  if (batchMatch) submissionError = '';
  if (view === 'create' && !composeParent && !submitting) { const active = jobs.find(j => ['running', 'canceling'].includes(j.status)); selected = undefined; currentJob = active?.id; submissionError = ''; remember('selected', null); remember('current-job', currentJob ?? null); if (active) { view = 'listen'; history.replaceState(history.state, '', '#listen'); } renderBatch(); renderGeneration(); }
  document.body.dataset.view = view;
  for (const id of ['create', 'library', 'history', 'settings']) $(id + '-view').hidden = id === 'create' ? !['create', 'listen'].includes(view) : view !== id;
  for (const link of document.querySelectorAll('nav a')) { if (link.hash === '#' + view || view === 'listen' && link.hash === '#create') link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }
  $('more-menu').open = false;
  if (!$('workspace').getClientRects().length) { closeEditor(); $('workspace').querySelectorAll('audio').forEach(p => p.pause()); }
  remember('view', view);
  if (push) { $('main').focus({ preventScroll: true }); scrollTo(0, 0); }
}
document.addEventListener('click', event => { const link = event.target.closest('a[href^="#"]'); if (!link || link.classList.contains('skip')) return; event.preventDefault(); if (link.hash === '#create') composeParent = undefined; navigate(link.hash.slice(1)); });
window.addEventListener('popstate', async () => { if (history.state?.selected && history.state.selected !== selected) await select(history.state.selected); navigate(location.hash.slice(1), false); if (reviewBatchId && view === 'listen') await openReviewSound($('batch-sound').value); scrollTo(0, history.state?.scroll ?? 0); });
async function loadFeedback(ids = candidates.map(c => c.candidate_sha256)) {
  const histories = [];
  // Bound in-flight requests: large libraries exhaust Chromium's request resources.
  for (let offset = 0; offset < ids.length; offset += 16) {
    histories.push(...await Promise.all(ids.slice(offset, offset + 16).map(id => api(`candidates/${id}/feedback`))));
  }
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
  const url = URL.createObjectURL(await response.blob()); const link = node('a', undefined, document.body, { href: url, download: `take-${takeFor(id).number}-${id.slice(0, 8)}.tar` }); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); say('Downloaded prepared audio, original, provenance and exact-version feedback.'); offerLibrary(c);
}
// Web Audio playback keeps source-relative seeking while auditioning the exported PCM.
function trimPlayback(media, render, bounds, repeating = false) {
  const player = new EventTarget(), nodes = new Set();
  let context, current, offset = bounds().start, started = 0, duration = 0, playing = false, epoch = 0, disposed = false;
  const emit = name => player.dispatchEvent(new Event(name));
  const time = () => {
    if (!playing) return offset;
    const elapsed = offset - bounds().start + context.currentTime - started;
    return bounds().start + (repeating ? elapsed % duration : Math.min(duration, elapsed));
  };
  const clear = () => { for (const entry of nodes) { entry.source.onended = null; entry.source.stop(); entry.source.disconnect(); entry.gain.disconnect(); } nodes.clear(); current = undefined; };
  player.pause = () => { epoch++; offset = time(); playing = false; clear(); emit('pause'); };
  const install = rendered => {
    const pcm = rendered.pcm, channels = rendered.channels;
    const buffer = context.createBuffer(channels, pcm.length / channels, rendered.sampleRate);
    for (let channel = 0; channel < channels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let frame = 0; frame < data.length; frame++) data[frame] = pcm[frame * channels + channel];
    }
    offset = time(); duration = buffer.duration;
    const at = Math.max(0, Math.min(duration, offset - bounds().start));
    if (!repeating && at >= duration) { player.pause(); return; }
    const previous = current, now = context.currentTime;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.loop = repeating; source.connect(gain); gain.connect(context.destination);
    current = { source, gain }; nodes.add(current);
    const entry = current;
    source.onended = () => {
      nodes.delete(entry); source.disconnect(); gain.disconnect();
      if (current === entry && playing) { offset = bounds().start + duration; playing = false; current = undefined; emit('ended'); emit('pause'); }
    };
    if (previous) {
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + 0.005);
      previous.gain.gain.cancelAndHoldAtTime(now); previous.gain.gain.linearRampToValueAtTime(0, now + 0.005);
      previous.source.stop(now + 0.005);
    }
    started = now; playing = true; source.start(now, repeating ? at % duration : at);
  };
  player.play = async () => {
    if (disposed || playing) return;
    const token = ++epoch;
    context ??= new AudioContext({ sampleRate: 44100 });
    await context.resume();
    const rendered = await render();
    if (disposed || token !== epoch) return;
    unloadYoutube(); document.querySelectorAll('audio').forEach(audio => audio.pause());
    install(rendered); if (playing) { emit('play'); emit('playing'); }
  };
  player.refresh = async () => {
    if (!playing) return;
    const token = ++epoch, rendered = await render();
    if (!disposed && playing && token === epoch) install(rendered);
  };
  player.dispose = () => { disposed = true; player.pause(); if (context) void context.close(); };
  player.load = () => { player.error = null; media.load(); };
  Object.defineProperties(player, {
    currentTime: { get: time, set(value) { const resume = playing; player.pause(); offset = value; emit('seeked'); if (resume) void player.play().catch(error => { player.error = error; emit('error'); }); } },
    paused: { get: () => !playing }, ended: { get: () => !playing && offset >= bounds().start + duration },
    src: { get: () => media.src, set(value) { media.src = value; } }, readyState: { get: () => media.readyState },
  });
  media.addEventListener('loadedmetadata', () => emit('loadedmetadata'));
  media.addEventListener('error', () => { player.error = media.error; emit('error'); });
  return player;
}

function waveformTrim(c, editor, form, preview, draft, changed) {
  const seconds = c.evidence.generation.audio.seconds, gap = Math.min(0.01, seconds);
  const frame = node('div', undefined, form, { class: 'trim-waveform' });
  const timeline = node('div', undefined, frame, { class: 'trim-timeline' });
  const canvas = node('canvas', undefined, timeline, { 'aria-hidden': 'true' });
  const selection = node('div', undefined, timeline, { class: 'trim-selection', 'aria-hidden': 'true' });
  const cursor = node('div', undefined, timeline, { class: 'trim-playhead', 'aria-hidden': 'true' });
  const handles = {};
  const readout = node('p', '', form, { class: 'trim-times' });
  const actions = node('div', undefined, form, { class: 'actions' });
  const play = node('button', '▶ Play', actions, { type: 'button' }); play.disabled = true;
  const status = node('p', '', form, { class: 'hint', role: 'status' });
  const retry = node('button', 'Retry audio', form, { type: 'button' }); retry.hidden = true;
  let source, sourcePromise, loading, disposed = false, animation, drag, playEpoch = 0;
  const controller = new AbortController();
  const position = () => { cursor.style.left = `${100 * Math.max(draft.start, Math.min(draft.end, preview.currentTime)) / seconds}%`; };
  const pause = () => { playEpoch++; preview.pause(); cancelAnimationFrame(animation); play.textContent = '▶ Play'; position(); };
  const fail = message => { pause(); status.textContent = message; retry.hidden = false; play.disabled = true; };
  const sync = () => {
    if (disposed) return;
    if (preview.currentTime >= draft.end) { pause(); preview.currentTime = draft.end; }
    position();
    if (!preview.paused) animation = requestAnimationFrame(sync);
  };
  const draw = () => {
    if (!source || disposed) return;
    const width = Math.max(1, Math.round(timeline.clientWidth)), height = 96, ratio = devicePixelRatio || 1;
    canvas.width = width * ratio; canvas.height = height * ratio;
    const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
    ctx.strokeStyle = getComputedStyle(editor).getPropertyValue('--primary'); ctx.lineWidth = 1;
    const frames = source.samples.length / source.channels;
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      let low = 0, high = 0;
      for (let i = Math.floor(x * frames / width); i < Math.min(frames, Math.ceil((x + 1) * frames / width)); i++) {
        for (let channel = 0; channel < source.channels; channel++) {
          const value = source.samples[i * source.channels + channel]; low = Math.min(low, value); high = Math.max(high, value);
        }
      }
      ctx.moveTo(x + 0.5, 48 - high * 46); ctx.lineTo(x + 0.5, 48 - low * 46);
    }
    ctx.stroke();
  };
  const update = () => {
    for (const name of ['start', 'end']) {
      const handle = handles[name]; handle.style.left = `${100 * draft[name] / seconds}%`;
      handle.setAttribute('aria-valuenow', draft[name]); handle.setAttribute('aria-valuetext', formatDuration(draft[name]));
      handle.setAttribute('aria-valuemin', name === 'start' ? 0 : draft.start + gap);
      handle.setAttribute('aria-valuemax', name === 'start' ? draft.end - gap : seconds);
    }
    selection.style.left = `${100 * draft.start / seconds}%`; selection.style.right = `${100 * (seconds - draft.end) / seconds}%`;
    timeline.style.setProperty('--start', `${100 * draft.start / seconds}%`); timeline.style.setProperty('--end', `${100 * draft.end / seconds}%`);
    readout.textContent = `Start ${formatDuration(draft.start)} · End ${formatDuration(draft.end)} · Selected ${formatDuration(draft.end - draft.start)}`;
    position();
  };
  const adjust = (name, value) => {
    pause(); stopLoopPreview();
    draft[name] = name === 'start' ? Math.max(0, Math.min(draft.end - gap, value)) : Math.min(seconds, Math.max(draft.start + gap, value));
    draft.preserveNative = false; changed(); preview.currentTime = draft.start; update();
  };
  const timeAt = event => { const rect = timeline.getBoundingClientRect(); return (event.clientX - rect.left) / rect.width * seconds; };
  for (const name of ['start', 'end']) {
    const handle = node('div', name === 'start' ? '‹' : '›', timeline, { id: `cut-${name}`, class: `trim-handle trim-${name}`, role: 'slider', tabindex: '0', 'aria-label': name === 'start' ? 'Start' : 'End', 'aria-orientation': 'horizontal' });
    handles[name] = handle;
    handle.onkeydown = event => {
      const delta = { ArrowLeft: -0.01, ArrowDown: -0.01, ArrowRight: 0.01, ArrowUp: 0.01 }[event.key];
      if (delta === undefined && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault(); adjust(name, event.key === 'Home' ? 0 : event.key === 'End' ? seconds : Number((draft[name] + delta).toFixed(10)));
    };
    handle.onpointerdown = event => {
      if (drag || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation(); handle.focus(); handle.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, offset: draft[name] - timeAt(event) }; adjust(name, draft[name]);
    };
    handle.onpointermove = event => { if (drag?.id === event.pointerId) adjust(name, Math.round((timeAt(event) + drag.offset) * 100) / 100); };
    handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = event => { if (drag?.id === event.pointerId) drag = undefined; };
  }
  timeline.onpointerdown = event => {
    if (event.target.closest('.trim-handle') || drag || event.button !== 0 || preview.readyState === 0) return;
    preview.currentTime = Math.max(draft.start, Math.min(draft.end, timeAt(event))); position();
  };
  preview.addEventListener('play', () => { if (disposed) return pause(); play.textContent = 'Ⅱ Pause'; cancelAnimationFrame(animation); sync(); });
  preview.addEventListener('pause', () => { if (!preview.paused) return; playEpoch++; cancelAnimationFrame(animation); play.textContent = '▶ Play'; position(); });
  preview.addEventListener('timeupdate', () => { if (preview.currentTime >= draft.end && !preview.paused) { pause(); preview.currentTime = draft.end; } position(); });
  preview.addEventListener('seeked', position);
  preview.addEventListener('ended', () => { if (!preview.ended) return; pause(); preview.currentTime = draft.end; position(); });
  preview.addEventListener('error', () => fail('Original audio could not load. Retry audio to continue.'));
  play.onclick = async () => {
    if (!preview.paused) return pause();
    stopLoopPreview(); const epoch = ++playEpoch;
    if (preview.currentTime < draft.start || preview.currentTime >= draft.end) preview.currentTime = draft.start;
    try { await preview.play(); if (disposed) preview.pause(); }
    catch (error) { if (!disposed && epoch === playEpoch) { pause(); status.textContent = `Playback failed: ${error.message}. Press Play to retry.`; } }
  };
  const getSource = () => sourcePromise ??= (async () => {
    const { decodeLoopWav } = await import('/loop-audio.mjs');
    const response = await fetch(preview.src, { signal: controller.signal });
    if (!response.ok) throw new Error('Original audio could not load.');
    return decodeLoopWav(await response.arrayBuffer());
  })().catch(error => { sourcePromise = undefined; throw error; });
  const ready = () => { if (!disposed && source && preview.readyState > 0 && !preview.error) { play.disabled = false; status.textContent = ''; retry.hidden = true; editor.querySelector('.playback-error')?.remove(); preview.currentTime = draft.start; position(); } };
  preview.addEventListener('loadedmetadata', ready);
  const load = async () => {
    if (loading || disposed) return;
    loading = true; pause(); play.disabled = true; retry.hidden = true; status.textContent = 'Loading waveform…';
    try { source = await getSource(); if (!disposed) { draw(); ready(); } }
    catch (error) { if (!disposed) fail(`${error.message} Retry audio to load the waveform.`); }
    finally { loading = false; }
  };
  retry.onclick = () => { preview.load(); void load(); };
  const resize = new ResizeObserver(draw); resize.observe(timeline);
  editor.dispose = () => { disposed = true; pause(); preview.dispose(); controller.abort(); resize.disconnect(); };
  update(); void load();
  return { update, pause, getSource };
}

function trim(c, box) {
  if (editorId === c.candidate_sha256) { closeEditor(); return; } closeEditor(); editorId = c.candidate_sha256;
  const id = c.candidate_sha256, seconds = c.evidence.generation.audio.seconds, bounds = c.evidence.cut?.bounds;
  const draft = recall('trim-' + id, { loop: c.evidence.cut?.request?.loop ?? c.evidence.generation.request.loop ?? false, crossfade: c.evidence.cut?.loop?.overlap_frames ? c.evidence.cut.loop.overlap_frames / bounds.sample_rate : 0.5, preserveNative: c.evidence.cut?.loop?.processing_version === 'native-gain-v1', start: bounds ? bounds.start_sample / bounds.sample_rate : 0, end: bounds ? bounds.end_sample / bounds.sample_rate : seconds });
  draft.loop ??= c.evidence.cut?.request?.loop ?? c.evidence.generation.request.loop ?? false; draft.crossfade ??= 0.5; draft.curve ??= c.evidence.cut?.loop?.curve ?? 'equal-power';
  draft.gain = Number.isFinite(draft.gain) ? Math.max(-12, Math.min(12, draft.gain)) : c.evidence.cut?.request?.gain_db ?? 0;
  draft.start = Math.max(0, Math.min(seconds, Number(draft.start) || 0)); draft.end = Math.max(0, Math.min(seconds, Number(draft.end) || seconds));
  if (draft.end <= draft.start) { draft.start = 0; draft.end = seconds; }
  const editor = node('section', undefined, box, { class: 'trim-editor', 'data-editor': id }); node('h5', `Trim · ${identity(c)}`, editor);
  const form = node('form', undefined, editor), duration = node('p', '', form, { class: 'trim-duration', role: 'status' });
  const media = audio(c, editor, `Trim source · ${identity(c)}`, true); media.controls = false;
  let settingsPromise;
  const render = async (repeating = false) => {
    const { renderTrim, renderLoop, quantizeLoop } = await import('/loop-audio.mjs');
    const source = await waveform.getSource();
    settingsPromise ??= fetch('/qa-config.json').then(response => { if (!response.ok) throw new Error('Trim settings could not load'); return response.json(); }).catch(error => { settingsPromise = undefined; throw error; });
    const settings = await settingsPromise;
    const options = { ...cutInput(), peak_db: c.evidence.cut?.request?.peak_db ?? settings.export_peak_db,
      normalize: c.evidence.cut?.request?.normalize ?? true, fade_ms: settings.fade_ms,
      native_provider_loop: c.evidence.generation.runtime.backend === 'elevenlabs' && c.evidence.generation.settings.loop === true };
    const rendered = (repeating ? renderLoop : renderTrim)(source.samples, source.sampleRate, source.channels,
      repeating ? options : { ...options, start_seconds: draft.start, end_seconds: draft.end });
    return { pcm: quantizeLoop(rendered.samples), channels: source.channels, sampleRate: source.sampleRate };
  };
  const preview = trimPlayback(media, () => render(false), () => draft);
  editor.playback = preview;
  const error = node('p', '', form, { class: 'error', role: 'status' });
  const valid = () => draft.start < draft.end && (!draft.loop || draft.crossfade >= 0.05 && draft.crossfade <= 2 && draft.end - draft.start >= 0.2);
  const cutInput = () => ({ gain_db: draft.gain, ...(c.evidence.cut?.request?.peak_db === undefined ? {} : { peak_db: c.evidence.cut.request.peak_db }), ...(c.evidence.cut?.request?.normalize === undefined ? {} : { normalize: c.evidence.cut.request.normalize }), ...(draft.loop && draft.preserveNative ? { loop: true } : { start_seconds: draft.start, end_seconds: draft.end, loop: draft.loop, ...(draft.loop ? { crossfade_seconds: draft.crossfade, curve: draft.curve } : {}) }) });
  let save;
  const update = () => { remember('trim-' + id, draft); duration.textContent = ''; error.textContent = valid() ? '' : 'Choose Start before End; loops need at least 0.2 seconds and a 0.05–2 second crossfade.'; if (save) { save.disabled = save.hasAttribute('aria-busy') || !valid(); if (!save.hasAttribute('aria-busy')) save.textContent = draft.loop ? 'Save loop' : 'Save trim'; } preview.pause(); stopLoopPreview(); };
  const waveform = waveformTrim(c, editor, form, preview, draft, update);
  const levelLabel = node('label', 'Level ', form, { for: 'cut-gain' });
  const levelValue = node('output', '', levelLabel, { for: 'cut-gain' });
  const level = node('input', undefined, form, { id: 'cut-gain', type: 'range', min: '-12', max: '12', step: '0.5', value: draft.gain });
  const showLevel = () => { levelValue.textContent = `${draft.gain > 0 ? '+' : ''}${draft.gain.toFixed(1)} dB`; level.setAttribute('aria-valuetext', levelValue.textContent); };
  let levelFrame;
  const adjustLevel = () => {
    draft.gain = Number(level.value); remember('trim-' + id, draft); showLevel();
    cancelAnimationFrame(levelFrame);
    levelFrame = requestAnimationFrame(() => { void Promise.all([preview.refresh(), repeatingPreview.refresh()]).catch(failure => { preview.pause(); stopLoopPreview(); error.textContent = failure.message; }); });
  };
  level.oninput = adjustLevel;
  const resetLevel = node('button', 'Reset level', form, { type: 'button' });
  resetLevel.onclick = () => { level.value = '0'; adjustLevel(); }; showLevel();
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
  const repeatingPreview = trimPlayback(media, () => render(true), () => draft, true);
  const disposeWaveform = editor.dispose;
  editor.dispose = () => { cancelAnimationFrame(levelFrame); repeatingPreview.dispose(); disposeWaveform(); };
  const actions = node('div', undefined, form, { class: 'actions' });
  const loopPlay = node('button', 'Preview loop', actions, { type: 'button' });
  repeatingPreview.addEventListener('error', () => { stopLoopPreview(); duration.textContent = 'Audio could not load. Retry audio to continue.'; });
  repeatingPreview.addEventListener('pause', () => { loopPlay.textContent = 'Preview loop'; duration.textContent = ''; });
  loopPlay.onclick = async () => {
    if (loopPlayer) { stopLoopPreview(); return; }
    if (!draft.loop || !valid()) { duration.textContent = 'Enable Loop and choose valid bounds and crossfade.'; return; }
    waveform.pause(); loopPlayer = repeatingPreview;
    loopPlay.textContent = 'Stop loop'; duration.textContent = 'Loading processed loop preview…';
    try {
      await repeatingPreview.play();
      if (!repeatingPreview.paused) duration.textContent = 'Processed loop preview · repeating';
    } catch (failure) { stopLoopPreview(); duration.textContent = failure.message; }
  };
  node('p', 'Play includes fades, normalization and Level. Preview loop repeats the processed blend. Boosts are peak-limited to prevent clipping. Saving selects the new version as the main track. Download uses that saved version.', form, { class: 'hint' });
  save = node('button', 'Save trim', form, { type: 'button' }); save.dataset.pendingKey = 'trim-' + id;
  save.onclick = () => {
    if (!valid()) return;
    const input = cutInput(), row = editor.parentElement;
    runButton(save, async () => {
      const result = await api(`candidates/${id}/cut`, input);
      await refresh();
      const saved = candidates.find(c => c.candidate_sha256 === result.candidate_sha256);
      remember('version-' + takeFor(saved.candidate_sha256).id, saved.candidate_sha256);
      await useTake(saved);
      const stillEditing = editorId === id && editor.isConnected && row.isConnected;
      if (stillEditing) closeEditor();
      if (stillEditing && row.isConnected && !editorId) { row.dataset.manualVersion = 'true'; row.replaceChildren(); renderClip(saved, row); trim(saved, row); node('p', 'Saved and selected as main track.', row, { role: 'status' }); }
    });
  };
  form.onsubmit = event => event.preventDefault(); update();
}
async function select(id) {
  const c = candidates.find(c => c.candidate_sha256 === id); if (!c) return;
  if (takeFor(selected)?.sound !== takeFor(id)?.sound) { closeEditor(); document.querySelectorAll('audio').forEach(p => p.pause()); }
  selected = id; submissionError = ''; remember('selected', id); remember('version-' + takeFor(id).id, id);
  currentJob = takeFor(id).job?.id; remember('current-job', currentJob ?? null); $('empty').hidden = true; renderBatch(); renderGeneration(); renderLibrary();
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
  const take = takeFor(c.candidate_sha256);
  if (c.evidence.cut?.request?.loop ?? c.evidence.generation.request.loop) node('span', 'Loop', row, { class: 'loop-badge' });
  node('h4', `Clip ${take.number} · ${versionFor(take, c.candidate_sha256).name}`, row);
  const meta = node('p', undefined, row, { class: 'clip-meta' });
  node('strong', formatDuration(clipDuration(c)), meta, { class: 'clip-duration' });
  node('span', sourceLabel(take.job?.provider ?? c.evidence.generation.runtime?.backend), meta);
  node('strong', 'Main track', row, { 'data-selected': '', class: 'selected-badge', hidden: '' });
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
  const versions = take.versions; row.dataset.versionCount = String(versions.length); row.dataset.preferred = take.preferred?.candidate_sha256 ?? '';
  if (!pinned && versions.length > 1) { const label = node('label', 'Saved version', row, { class: 'clip-version' }); const list = node('select', undefined, label, { 'aria-label': 'Saved version' }); for (const v of versions) node('option', v.name, list, { value: (v.records.find(r => r.candidate_sha256 === c.candidate_sha256) ?? v.candidate).candidate_sha256 }); list.value = c.candidate_sha256; list.onchange = () => { row.dataset.manualVersion = 'true'; closeEditor(); player.pause(); const next = candidates.find(c => c.candidate_sha256 === list.value); remember('version-' + takeFor(next.candidate_sha256).id, next.candidate_sha256); row.replaceChildren(); renderClip(next, row); }; }
  const secondary = node('details', undefined, row, { class: 'clip-secondary' }); node('summary', 'More clip actions', secondary);
  recreateButton(c, secondary); button('Download', secondary, () => download(c)); const add = button('Add to library', secondary, () => addLibrary(c)); add.dataset.libraryCandidate = c.candidate_sha256; updateLibraryButtons(); updateSelected();
}
function isBatchCandidate(c) { return batchReviews.some(b => b.sounds.some(s => s.sound_id === takeFor(c.candidate_sha256)?.sound)); }
function inLibrary(c) { return libraryEntries.some(e => e.candidate_sha256 === c.candidate_sha256); }
function updateLibraryButtons() {
  document.querySelectorAll('[data-library-candidate]').forEach(b => {
    if (b.hasAttribute('aria-busy')) return;
    const saved = libraryEntries.some(e => e.candidate_sha256 === b.dataset.libraryCandidate);
    b.textContent = saved ? 'In library' : 'Add to library'; b.disabled = saved;
  });
  const offer = $('library-offer');
  if (libraryEntries.some(e => e.candidate_sha256 === offer.dataset.candidate)) offer.hidden = true;
}
async function addLibrary(c) {
  const entry = await api('library', { candidate_sha256: c.candidate_sha256 });
  libraryEntries = [entry, ...libraryEntries.filter(e => e.id !== entry.id)];
  updateLibraryButtons(); renderLibrary(); say('Added to library. Keywords will be suggested when generation is idle.');
}
function offerLibrary(c) {
  if (isBatchCandidate(c) || inLibrary(c)) return;
  const box = $('library-offer'); box.replaceChildren(); box.hidden = false; box.dataset.candidate = c.candidate_sha256;
  node('h2', 'Keep this sound?', box); node('p', identity(c), box);
  const actions = node('div', undefined, box, { class: 'actions' });
  button('Add to library', actions, () => addLibrary(c));
  button('Not now', actions, () => { box.hidden = true; }, local);
}
function renderLibrary() {
  renderHistory();
  const box = $('library'), terms = $('library-search').value.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = libraryEntries.filter(e => { const text = [e.title, ...e.keywords, e.original_request, e.prompt].join(' ').toLowerCase(); return terms.every(term => text.includes(term)); });
  const editing = new Set([...box.querySelectorAll('[data-entry]')].filter(row => row.querySelector('form')).map(row => row.dataset.entry));
  const visible = libraryEntries.filter(e => matches.includes(e) || editing.has(e.id));
  const pinned = visible.length - matches.length;
  $('library-count').textContent = `${matches.length} sound${matches.length === 1 ? '' : 's'}${pinned ? ` · ${pinned} editing draft${pinned === 1 ? '' : 's'} kept visible` : ''}`;
  box.querySelector('.empty')?.remove();
  for (const row of box.querySelectorAll('[data-entry]')) if (!visible.some(e => e.id === row.dataset.entry)) { row.querySelectorAll('audio').forEach(p => p.pause()); row.remove(); }
  for (const entry of visible) {
    let row = box.querySelector(`[data-entry="${entry.id}"]`);
    if (row?.dataset.revision === String(entry.revision)) continue;
    if (row && (row.contains(document.activeElement) || row.querySelector('form') || [...row.querySelectorAll('audio')].some(p => !p.paused))) {
      if (row.dataset.candidate !== entry.candidate_sha256) {
        if (!row.querySelector('.library-stale')) node('p', 'Winner changed. This is the previous version. Finish editing or pause playback and leave this card to load the current winner.', row, { class: 'library-stale hint', role: 'status' });
        row.querySelectorAll('[data-version-action]').forEach(b => { b.disabled = true; });
      }
      continue;
    }
    if (!row) row = node('article', undefined, box, { class: 'take', 'data-entry': entry.id });
    row.dataset.revision = String(entry.revision); row.dataset.candidate = entry.candidate_sha256; row.replaceChildren();
    node('h2', entry.title, row);
    node('p', `${formatDuration(entry.duration_seconds)} · ${entry.provider}${entry.loop ? ' · Loop' : ''}${entry.batch_id ? ' · Batch winner' : ''}`, row, { class: 'hint' });
    const tags = node('div', undefined, row, { class: 'library-keywords', 'aria-label': 'Keywords' });
    for (const keyword of entry.keywords) node('span', keyword, tags);
    const c = candidates.find(c => c.candidate_sha256 === entry.candidate_sha256);
    if (c) audio(c, row, entry.title);
    if (entry.tagging === 'pending') node('p', 'Keywords pending · suggested when generation is idle.', row, { class: 'hint' });
    if (entry.tagging === 'failed') node('p', 'Keywords unavailable. Search by prompt or add your own.', row, { class: 'hint' });
    const actions = node('div', undefined, row, { class: 'actions' });
    if (c) {
      button('Download', actions, () => download(c)).dataset.versionAction = '';
      button('Open take', actions, async () => { await select(c.candidate_sha256); navigate('listen'); }, local).dataset.versionAction = '';
    }
    button('Edit details', actions, () => editLibrary(entry, row), local);
    if (entry.tagging === 'failed') button('Retry keywords', actions, async () => { await api(`library/${entry.id}/keywords`, { revision: entry.revision }); await refresh(); });
    const details = node('details', undefined, row); node('summary', 'Prompts and source', details);
    node('h3', 'Original request', details); node('p', entry.original_request, details);
    node('h3', 'Generation prompt', details); node('p', entry.prompt, details);
    if (entry.batch_id) node('a', 'Open batch review', details, { href: '#batch/' + entry.batch_id });
  }
  visible.forEach((entry, index) => { const row = box.querySelector(`[data-entry="${entry.id}"]`); if (row && box.children[index] !== row) box.insertBefore(row, box.children[index] ?? null); });
  if (!visible.length) node('p', libraryEntries.length ? 'No sounds match. Try fewer words.' : 'Your library starts with a winner. Select a batch winner or add a sound from History.', box, { class: 'empty' });
}
function editLibrary(entry, row) {
  if (row.querySelector('form')) return;
  const form = node('form', undefined, row, { class: 'library-editor' });
  const titleLabel = node('label', 'Title', form), name = node('input', undefined, titleLabel, { required: '', maxlength: '200', value: entry.title });
  const tagsLabel = node('label', 'Keywords (comma separated)', form), tags = node('textarea', undefined, tagsLabel, { rows: '3', maxlength: '1310' }); tags.value = entry.keywords.join(', ');
  node('p', 'Up to 16 keywords, 80 characters each.', form, { class: 'hint' });
  const status = node('p', '', form, { role: 'status' });
  const actions = node('div', undefined, form, { class: 'actions' });
  const save = node('button', 'Save details', actions, { type: 'submit', class: 'primary' });
  button('Cancel', actions, () => { form.remove(); row.dataset.revision = ''; renderLibrary(); }, local);
  form.onsubmit = event => { event.preventDefault(); runButton(save, async () => {
    try {
      const input = { revision: entry.revision };
      if (name.value !== entry.title) input.title = name.value;
      if (tags.value !== entry.keywords.join(', ')) input.keywords = tags.value.split(',').map(s => s.trim()).filter(Boolean);
      if (Object.keys(input).length > 1) await api(`library/${entry.id}`, input, undefined, 'PATCH');
      form.remove(); row.dataset.revision = ''; await refresh(); say('Library details saved.');
    } catch (error) { status.textContent = error.status === 409 ? 'This entry changed. Your draft is preserved; cancel and reopen to edit the latest version.' : error.message; }
  }); };
  name.focus();
}
$('library-search').oninput = renderLibrary;
function renderHistory() {
  const signature = JSON.stringify([candidates.map(c => c.candidate_sha256), selections, $('search').value, $('human-filter').value]); if ($('history-list').dataset.signature === signature) return; $('history-list').dataset.signature = signature;
  const focused = $('history-list').contains(document.activeElement) ? document.activeElement.dataset.libraryFocus : null;
  const disclosures = new Map([...$('history-list').querySelectorAll('details')].map(details => [details.querySelector('summary').dataset.libraryFocus, details.open]));
  $('history-list').replaceChildren(); const query = $('search').value.toLowerCase(); const filter = $('human-filter').value;
  const sounds = new Map(); for (const take of takes) { if (!sounds.has(take.sound)) sounds.set(take.sound, []); sounds.get(take.sound).push(take); }
  let shown = 0;
  for (const group of sounds.values()) {
    if (!group.some(t => title(t.records[0]).toLowerCase().includes(query))) continue;
    const hasSelection = selections.some(s => s.sound_id === group[0].sound); const visible = filter === 'all' || (filter === 'selected' ? hasSelection : !hasSelection) ? group : []; if (!visible.length) continue;
    shown++; const box = node('article', undefined, $('history-list'), { class: 'take' }); node('h2', title(group[0].records[0]), box); node('p', `${group.length} take${group.length === 1 ? '' : 's'}`, box, { class: 'hint' });
    const best = selections.find(s => s.sound_id === group[0].sound); if (best) button('Open selected best take', box, async () => { await select(best.candidate_sha256); navigate('listen'); }, local).dataset.libraryFocus = 'best-' + group[0].sound;
    for (const take of visible) {
      const row = node('div', undefined, box, { class: 'library-item' }); const chosen = preferred(take);
      if (chosen) button(`${identity(chosen)}${selections.some(s => s.candidate_sha256 === chosen.candidate_sha256) ? ' · Selected' : ''}`, row, async () => { await select(chosen.candidate_sha256); navigate('listen'); }, local).dataset.libraryFocus = take.id;
      else node('p', `Take ${take.number} · Choose a version`, row);
      const versions = node('details', undefined, row); node('summary', chosen ? 'Versions' : 'Choose a version', versions).dataset.libraryFocus = 'versions-' + take.id; versions.open = disclosures.get('versions-' + take.id) ?? !chosen;
      for (const v of take.versions) button(v.name, versions, async () => { await select(v.candidate.candidate_sha256); navigate('listen'); }, local).dataset.libraryFocus = v.candidate.candidate_sha256;
    }
  }
  if (!shown) node('p', takes.length ? 'No sounds match these filters.' : 'No saved sounds yet. Start in Create.', $('history-list'), { class: 'empty' });
  if (focused) {
    const target = [...$('history-list').querySelectorAll('[data-library-focus]')].find(el => el.dataset.libraryFocus === focused) ?? $('human-filter');
    const details = target.closest('details'); if (details) details.open = true;
    target.focus({ preventScroll: true });
  }
}
$('search').oninput = renderHistory; $('human-filter').onchange = renderHistory;
function renderGeneration() {
  const current = jobs.find(j => j.id === currentJob);
  if (current?.provider === 'youtube') { $('generation-progress').hidden = true; $('active-link').hidden = true; return; }
  const sound = reviewBatchId ? batchReviews.find(b => b.id === reviewBatchId)?.sounds.find(s => s.key === reviewSoundKey)?.sound_id : (current?.sound_id ?? current?.id ?? takeFor(selected)?.sound);
  const active = !submitting && (!submissionError || current) && jobs.find(job => ['running', 'canceling'].includes(job.status) && (job.sound_id ?? job.id) === sound);
  const job = active ?? current;
  const working = submitting || Boolean(active);
  $('generate').disabled = submitting || jobs.some(j => ['running', 'canceling'].includes(j.status)); $('generate').textContent = submitting ? 'Submitting…' : active ? 'Generation in progress…' : 'Generate 5 local takes';
  $('generation-progress').hidden = !submitting && !submissionError && !job; $('generation-spinner').hidden = !working;
  const stages = { queued: 'Starting your request…', planning: 'Preparing prompt variations…', setup: 'Preparing generation…', generating: 'Generating your sound…', analyzing: 'Checking audio…', cutting: 'Preparing your clip…', evaluating: 'Checking the prepared clip…', retry_pending: 'Preparing another attempt…' };
  const outcomes = { completed: job?.candidate_ids?.length ? 'Generation finished — listen to your take' : 'Generation finished — no audio available', failed: 'Generation failed', canceled: 'Generation canceled', interrupted: 'Generation interrupted — review required', exhausted: 'Budget reached — review saved takes' };
  const stage = submitting ? 'Submitting request…' : submissionError && !job ? 'Request needs attention' : active ? active.status === 'canceling' ? 'Stopping generation…' : stages[active.progress] ?? 'Working on your sound…' : outcomes[job?.status] ?? (job ? 'Request queued…' : '');
  if ($('generation-stage').textContent !== stage) $('generation-stage').textContent = stage;
  const shown = submitting || submissionError && !job ? undefined : job;
  const elapsed = shown ? Math.max(0, Math.floor(((shown.finished_at ? Date.parse(shown.finished_at) : Date.now()) - Date.parse(shown.started_at)) / 1000)) : 0;
  $('generation-detail').textContent = submitting ? 'Saving your request. Please wait.' : shown ? `Take ${(shown.variant_index ?? 0) + 1}/${shown.provider === "elevenlabs" ? 1 : 5} · attempt ${shown.attempts?.at(-1)?.number ?? 1}/${shown.provider === "elevenlabs" ? 1 : 3} · ${elapsed}s elapsed` : '';
  $('generation-prompt').textContent = submitting || submissionError && !job ? submissionPrompt : shown?.input.request.prompt ?? ''; $('generation-error').textContent = submissionError || (shown?.error || shown?.status === 'failed' ? 'Generation did not complete. Any saved audio remains available below. See Settings diagnostics for details.' : '');
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
  $('readiness').textContent = text + (ready.planner === 'unavailable' ? ' · Generation planner unavailable; import and editing remain available' : ''); $('settings-readiness').textContent = $('readiness').textContent + (ready.youtube?.ready ? ' · YouTube ready' : ' · YouTube setup required: node scripts/setup-youtube.mjs');
}
async function refresh() {
  const [nextJobs, nextCandidates, nextSelections, nextBatches, nextLibrary] = await Promise.all([api('jobs'), api('candidates'), api('selections'), api('batches'), api('library'), refreshQa()]);
  if (currentJob) submissionError = '';
  batchReviews = nextBatches; libraryEntries = nextLibrary; updateLibraryButtons();
  selections = nextSelections;
  const changed = JSON.stringify(candidates) !== JSON.stringify(nextCandidates); jobs = nextJobs; candidates = nextCandidates.filter(c => c.evidence.generation.runtime?.backend !== 'youtube' || c.evidence.cut); takes = groupTakes(candidates, jobs);
  if (changed) { await loadFeedback(); renderLibrary(); }
  renderReviewBatch(); renderGeneration();
  renderBatch(); renderLibrary(); renderDiagnostics(); syncYoutube();
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
    const reason = (takeFor(c.candidate_sha256)?.job?.provider === 'youtube' ? takeFor(c.candidate_sha256).job.input.request.duration_seconds : c.evidence.generation.request.duration_seconds) > 30 ? 'ElevenLabs supports at most 30 seconds.' : readiness.elevenlabs !== 'configured' ? 'Configure an ElevenLabs key in Settings to generate.' : queued ? 'An equivalent ElevenLabs request is already pending.' : '';
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
    say(`Best take saved: ${identity(c)}.${isBatchCandidate(c) ? ' Added to library.' : ''}`); offerLibrary(c);
  } catch (error) {
    if (error.status === 409) { localStorage.removeItem('studio-selection-' + sound); await refresh(); renderBatch(); renderLibrary(); }
    throw new Error(`${identity(c)} could not be confirmed as best take: ${error.message}. Reconnect and choose this take again`);
  }
}
function renderBatch() {
  const item = batchReviews.find(b => b.id === reviewBatchId)?.sounds.find(s => s.key === reviewSoundKey);
  const current = jobs.find(j => j.id === currentJob);
  const sound = submitting || submissionError && !current ? undefined : item?.sound_id ?? current?.sound_id ?? current?.id ?? takeFor(selected)?.sound;
  const box = $('batch-results');
  if (!sound) { closeEditor(); box.querySelectorAll('audio').forEach(p => p.pause()); box.replaceChildren(); delete box.dataset.sound; $('sound-title').textContent = ''; $('sound-actions').replaceChildren(); delete $('sound-actions').dataset.sound; $('empty').hidden = submitting || Boolean(submissionError); return; }
  if (box.dataset.sound !== sound) { closeEditor(); box.querySelectorAll('audio').forEach(p => p.pause()); box.replaceChildren(); box.dataset.sound = sound; }
  $('empty').hidden = true; $('sound-title').textContent = item ? soundName(sound) : jobs.find(j => (j.sound_id ?? j.id) === sound)?.input.request.prompt.split('\n')[0] ?? soundName(sound);
  if ($('sound-actions').dataset.sound !== sound) {
    const actions = $('sound-actions'); actions.dataset.sound = item || takes.some(t => t.sound === sound) ? sound : ''; actions.replaceChildren();
    if (!item) { const take = takes.find(t => t.sound === sound); if (take) { button('Generate more', actions, () => anotherTake(take)); button('Edit prompt', actions, () => { const c = takes.find(t => t.sound === sound)?.records[0]; if (c) { $('prompt').value = c.evidence.generation.request.prompt; $('duration').value = c.evidence.generation.request.duration_seconds; $('loop').checked = [...jobs].filter(j => j.sound_id === sound || j.id === sound).sort((a,b) => a.started_at.localeCompare(b.started_at)).at(-1)?.input.request.loop === true; remember('loop', $('loop').checked); } composeParent = takes.find(t => t.sound === sound)?.job?.id; navigate('create'); $('prompt').focus(); }, local); } }
  }
  const winner = selections.find(s => s.sound_id === sound)?.candidate_sha256;
  let best = box.querySelector('[data-best]'); if (!best) best = node('section', undefined, box, { 'data-best': '', class: 'selected-winner' });
  const winnerRecord = candidates.find(c => c.candidate_sha256 === winner);
  if (best.dataset.id !== (winner ?? '')) {
    best.dataset.id = winner ?? '';
    const heading = best.querySelector('h3') ?? node('h3', 'Main track', best); heading.hidden = !winner;
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
    const groupTakes = takes.filter(t => (t.job?.id ?? t.id) === id), provider = sourceLabel(group.job?.provider ?? group.input?.provider), imported = provider === 'YouTube';
    const contains = groupTakes.some(t => t.records.some(c => c.candidate_sha256 === winner));
    const state = ['queued', 'paused'].includes(group.status) ? 'Queued' : ['running','canceling'].includes(group.status) ? (imported ? 'Importing audio' : 'Generating') : ['failed','interrupted'].includes(group.status) ? 'Failed' : group.status === 'canceled' ? 'Canceled' : 'Ready';
    const clipCount = group.job?.variants?.length ?? groupTakes.length;
    details.querySelector('summary').textContent = `${imported ? 'Import' : 'Generation'} ${index + 1} · ${provider} · ${clipCount} clip${clipCount === 1 ? '' : 's'} · ${index === groups.length - 1 ? 'Latest' : 'Earlier operation'}${contains ? ' · Contains selected winner' : ''}`;
    details.querySelector('.group-status').textContent = imported ? `${state} · ${group.job?.progress ?? group.status}${['running','canceling'].includes(group.status) ? ' · ' + Math.floor((Date.now() - Date.parse(group.job.started_at)) / 1000) + 's elapsed' : ''}${group.error ?? group.job?.error ? ' · ' + (group.error ?? group.job.error) : ''}` : state + (state === 'Failed' ? '. Generate more or check Settings diagnostics.' : '');
    if (imported) {
      let controls = details.querySelector('.import-controls');
      if (!controls) controls = node('div', '', details, { class: 'import-controls actions' });
      if (controls.dataset.status !== group.status) {
        controls.dataset.status = group.status; controls.replaceChildren();
        if (['queued','paused','running'].includes(group.status)) button('Cancel import', controls, async () => { await api(`jobs/${id}/cancel`, {}); await refresh(); });
        if (['failed','interrupted'].includes(group.status) && group.job) button('Retry import', controls, async () => { await api(`jobs/${id}/recover`, {}); await refresh(); });
      }
    }
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
  if (reviewSoundKey !== key) closeYoutube();
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
  $('batch-youtube').disabled = !batch;
  $('batch-title').textContent = batch?.name ?? 'Loading batch…'; if (!batch) { $('batch-error').textContent = 'Batch not loaded. Reconnect if it does not appear.'; return; }
  if (box.dataset.id !== reviewBatchId) { box.dataset.id = reviewBatchId; reviewSoundKey = recall('batch-sound-' + reviewBatchId, null); }
  const sound = batch.sounds.find(s => s.key === reviewSoundKey) ?? batch.sounds[0]; reviewSoundKey = sound.key;
  $('batch-progress').textContent = `${batch.progress.selected} of ${batch.progress.total} sounds selected`;
  $('batch-error').textContent = batch.queue_error ? 'The queue needs attention. Check Settings diagnostics.' : sound.operations.at(-1)?.error ? (sound.operations.at(-1).input.provider === 'youtube' ? sound.operations.at(-1).error : 'Generation failed. Try generating this sound again.') : '';
  const focusedSound = $('sound-list').contains(document.activeElement) ? document.activeElement.dataset.soundKey : null;
  const choices = $('batch-sound'), choicesSignature = JSON.stringify(batch.sounds.map(s => [s.key,s.status,Boolean(s.selection)]));
  if (choices.dataset.signature !== choicesSignature) { choices.dataset.signature = choicesSignature; choices.replaceChildren(); $('sound-list').replaceChildren(); for (const s of batch.sounds) { const state = s.selection ? 'Selected' : s.status === 'generating' ? 'Generating' : s.status === 'needs_attention' ? 'Failed' : 'Needs selection'; const label = `${soundName(s.sound_id)} · ${state}`; node('option', label, choices, { value: s.key }); const b = button(label, $('sound-list'), () => openReviewSound(s.key), local); b.dataset.soundKey = s.key; } }
  choices.value = sound.key; for (const b of $('sound-list').querySelectorAll('button')) { b.setAttribute('aria-current', String(b.dataset.soundKey === sound.key)); if (focusedSound === b.dataset.soundKey && document.activeElement !== b) b.focus({ preventScroll: true }); }
  currentJob = sound.operations.at(-1)?.job_id;
  const editorKey = reviewBatchId + ':' + sound.key;
  if ($('batch-edit').dataset.key !== editorKey) { $('batch-edit').dataset.key = editorKey; const value = recall('batch-edit-' + editorKey, sound.operations.findLast(o => o.input.provider !== 'youtube')?.input.request ?? sound.original_request); $('batch-prompt').value = value.prompt; $('batch-duration').value = String(value.duration_seconds); $('batch-loop').checked = value.loop === true; }
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
function showSubmission(input) {
  submitting = true; submissionError = ''; submissionPrompt = (recall('submission', null)?.input ?? input).request.prompt;
  selected = undefined; currentJob = undefined; remember('selected', null); remember('current-job', null);
  $('compose-error').textContent = '';
  if (view === 'create') navigate('listen');
  renderBatch(); renderGeneration();
}
async function submitInput(input, intent) {
  if (submitting) return; const requestedView = view; showSubmission(input);
  const previous = recall('submission', null); const pending = previous ?? { key: uid(), input, intent }; remember('submission', pending);
  try { const job = await api('jobs', pending.input, pending.key); localStorage.removeItem('studio-submission'); currentJob = job.id; remember('current-job', job.id); jobs = [job, ...jobs.filter(j => j.id !== job.id)]; submitting = false; renderBatch(); renderGeneration(); if (view === requestedView && ['create', 'listen'].includes(view) && view !== 'listen') navigate('listen'); await refresh(); if (!['running', 'canceling'].includes(job.status) && job.result?.candidate_sha256) await select(job.result.candidate_sha256); say('Request saved. Refresh safely to reconnect.'); }
  catch (error) { if ([400, 403, 409, 415, 422, 429].includes(error.status)) localStorage.removeItem('studio-submission'); submissionError = currentJob ? `Request saved, but progress could not refresh. Reconnect to continue. ${error.message}` : error.message; $('compose-error').textContent = submissionError; throw error; } finally { submitting = false; renderGeneration(); renderBatch(); }
}
$('compose').onsubmit = event => { event.preventDefault(); if ($('generate').disabled) return;
  const prompt = [$('prompt').value, $('events').value ? `Intended event count: ${$('events').value}.` : '', $('constraints').value.trim() ? `Constraints: ${$('constraints').value.trim()}` : ''].filter(Boolean).join('\n');
  const input = { provider: 'local', ...(composeParent ? { sound_parent_id: composeParent } : {}), request: { prompt, duration_seconds: Number($('duration').value), loop: $('loop').checked, ...($('seed').value ? { seed: Number($('seed').value) } : {}) } };
  showSubmission(input); action(async () => { submitting = false; await submitInput(input, 'compose'); });
};
async function connect() {
  const response = await fetch('/studio/session', { headers: { 'X-Studio-Bootstrap': '1' } }); if (!response.ok) throw new Error('Local session unavailable'); csrf = (await response.json()).csrf;
  document.querySelectorAll('audio').forEach(player => { if (player.error) player.load(); });
  const next = location.hash.slice(1) || 'create';
  currentJob = next === 'listen' ? recall('current-job', null) : undefined; await refresh(); await loadFeedback(); renderLibrary();
  const active = jobs.find(j => ['running', 'canceling'].includes(j.status));
  if (!reviewBatchId && active) { currentJob = active.id; selected = undefined; remember('current-job', active.id); remember('selected', null); }
  const id = recall('selected', null); if (!reviewBatchId && !active && next === 'listen' && !currentJob && candidates.some(c => c.candidate_sha256 === id)) await select(id);
  navigate(next, false); renderGeneration(); renderBatch(); if (reviewBatchId) await openReviewSound($('batch-sound').value); $('reconnect').hidden = true; say('Connected · saved locally');
  const batchPending = recall('batch-submission', null); if (batchPending) await batchMutation(batchPending);
  const pending = recall('submission', null); if (pending) await submitInput(pending.input, pending.intent);
  else { const job = jobs.find(j => j.id === currentJob); if (!selected && view === 'listen' && job?.result?.candidate_sha256) await select(job.result.candidate_sha256); }
}
$('reconnect').onclick = () => runButton($('reconnect'), connect);
renderLibrary(); action(connect); setInterval(() => { if (!busy && csrf) action(refresh); }, 2000);
