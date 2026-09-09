const $ = id => document.getElementById(id);
const uid = () => crypto.randomUUID().replaceAll('-', '');
let pendingAction = Promise.resolve();
let csrf, candidates = [], jobs = [], selected, busy = false;
const say = message => { $('status').textContent = message; };
const drafts = ['prompt', 'constraints', 'events', 'duration', 'attempts', 'minutes', 'mode'];
function remember(key, value) { localStorage.setItem('studio-' + key, JSON.stringify(value)); }
function recall(key, fallback) { try { return JSON.parse(localStorage.getItem('studio-' + key)) ?? fallback; } catch { return fallback; } }
for (const id of drafts) { $(id).value = recall(id, $(id).value); $(id).addEventListener($(id).tagName === 'SELECT' ? 'change' : 'input', () => remember(id, $(id).value)); }
$('blind').checked = recall('blind', false);
async function api(path, value, key) {
  const response = await fetch('/studio/' + path, { method: value === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Studio-CSRF': csrf, ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}
function action(operation) {
  pendingAction = pendingAction.then(async () => {
    busy = true;
    try { await operation(); } catch (error) { say(`Operation not completed: ${error.message}. Refresh connection and retry; saved work is preserved.`); }
    finally { busy = false; }
  });
  return pendingAction;
}
function node(tag, text, parent, attrs = {}) {
  const element = document.createElement(tag); if (text !== undefined) element.textContent = text;
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  parent?.append(element); return element;
}
function button(text, parent, operation) { const b = node('button', text, parent, { type: 'button' }); b.onclick = () => action(operation); return b; }
function audio(candidate, asset, parent, label) {
  node('p', label, parent, { class: 'hint' });
  const player = node('audio', undefined, parent, { controls: '', preload: 'metadata', 'aria-label': label, src: `/studio/candidates/${candidate.candidate_sha256}/${asset}` });
  player.addEventListener('play', () => document.querySelectorAll('audio').forEach(other => { if (other !== player) other.pause(); }));
  player.addEventListener('error', () => say('Playback unavailable. Refresh connection and select the saved take again.'));
}
function title(c) { return c.evidence.generation.request.prompt; }
function renderComparison() {
  $('comparison').replaceChildren();
  const c = candidates.find(c => c.candidate_sha256 === $('compare').value);
  if (c) { node('p', title(c), $('comparison')); audio(c, c.evidence.cut ? 'audio' : 'source', $('comparison'), 'Comparison playback'); }
}
$('compare').onchange = renderComparison;
async function select(id) {
  selected = id; remember('selected', id);
  const c = candidates.find(c => c.candidate_sha256 === id); if (!c) return;
  const history = await api(`candidates/${id}/feedback`);
  if (selected !== id) return;
  $('empty').hidden = true; $('candidate').replaceChildren();
  const box = node('article', undefined, $('candidate'), { class: 'take' });
  node('p', `${c.fixture ? 'SYNTHETIC FIXTURE · ' : ''}TAKE ${id.slice(0, 8)}`, box, { class: 'eyebrow' });
  node('h3', title(c), box);
  if (c.evidence.cut) audio(c, 'audio', box, 'Prepared clip');
  audio(c, 'source', box, 'Original');
  const human = history.at(-1);
  node('p', human ? `Human: ${human.verdict} · ${human.reason_tags.join(', ')}${human.note ? ' · ' + human.note : ''}` : 'Human: not reviewed', box);
  const verdict = node('div', undefined, box); verdict.hidden = $('blind').checked;
  node('p', c.evaluation ? `Automatic: ${c.evaluation.verdict} · ${c.evaluation.model} · ${c.evaluation.note}` : 'Automatic: unavailable — this take has no delivered-clip evaluation. Listen and decide.', verdict);
  if (c.evaluation?.evidence) {
    const e = c.evaluation.evidence;
    node('p', `Policy: ${e.policy.version} · ${e.status} / ${e.decision} · ${e.reason_tags.join(', ')} · ${e.elapsed_ms} ms`, verdict);
    node('p', `Model revision: ${c.evaluation.revision} · Audio SHA-256: ${c.evaluation.audio_sha256} · Policy SHA-256: ${c.evaluation.rubric_sha256}`, verdict, { class: 'hint' });
    for (const row of e.result?.clap?.scores ?? []) {
      node('p', `${row.start_seconds.toFixed(2)}–${row.end_seconds.toFixed(2)} s · target margin ${row.target_margin?.toFixed(4) ?? 'unavailable'}`, verdict);
      for (const score of row.ranking) node('p', `${score.similarity.toFixed(4)} · ${score.description}`, verdict, { class: 'hint' });
    }
    if (e.error || e.result?.clap?.error) node('p', e.error || e.result.clap.error, verdict);
    for (const limitation of e.policy.limitations) node('p', limitation, verdict, { class: 'hint' });
  }
  for (const report of c.evidence.analyses) {
    if (report.status !== 'completed') node('p', `Signal analysis ${report.status}: ${report.error || 'No result'}`, verdict);
    else node('p', `Signal advisory: ${report.result?.regions?.length ?? 0} active regions. ${report.result?.rhythm?.suspected ? 'Rhythmic pattern detected.' : ''} CLAP is advisory, not a verdict.`, verdict, { class: 'hint' });
  }
  const blindNote = node('p', 'Automatic evidence hidden for blind review.', box, { class: 'hint' }); blindNote.hidden = !$('blind').checked;
  const form = node('form', undefined, box);
  const fields = node('fieldset', undefined, form); node('legend', 'Adjust cut / seconds in original', fields);
  const pair = node('div', undefined, fields, { class: 'pair' });
  const bounds = c.evidence.cut?.bounds;
  for (const [name, value] of [['start', bounds ? bounds.start_sample / bounds.sample_rate : 0], ['end', bounds ? bounds.end_sample / bounds.sample_rate : c.evidence.generation.audio.seconds]]) {
    const wrap = node('div', undefined, pair); node('label', name === 'start' ? 'Start' : 'End', wrap, { for: 'cut-' + name });
    node('input', undefined, wrap, { id: 'cut-' + name, type: 'number', required: '', min: '0', max: c.evidence.generation.audio.seconds, step: 'any', value });
  }
  node('p', 'Creates a separate take with short fades and −3 dB peak normalization. Previous decisions stay with their exact audio.', fields, { class: 'hint' });
  node('button', 'Save adjusted cut', form);
  form.onsubmit = event => { event.preventDefault(); action(async () => {
    const input = { start_seconds: Number($('cut-start').value), end_seconds: Number($('cut-end').value) };
    say('Preparing and preserving adjusted cut…');
    const result = await api(`candidates/${id}/cut`, input); await refresh(); await select(result.candidate_sha256); say('Adjusted cut saved. Listen before reviewing this new take.');
  }); };
  const review = node('fieldset', undefined, box); node('legend', 'Your decision', review);
  const tags = node('div', undefined, review, { class: 'tags' });
  for (const tag of ['wrong_sound', 'extra_events', 'background_noise', 'artifacts', 'bad_trim', 'other']) {
    const label = node('label', undefined, tags); node('input', undefined, label, { type: 'checkbox', value: tag, name: 'reason' }); label.append(' ' + tag.replaceAll('_', ' '));
  }
  node('label', 'Review note (optional)', review, { for: 'note' }); node('textarea', undefined, review, { id: 'note', rows: '2', maxlength: '4000' });
  const actions = node('div', undefined, review, { class: 'actions' });
  for (const [label, verdict] of [['Approve', 'accepted'], ['Reject', 'rejected']]) button(label, actions, async () => {
    const reason_tags = [...tags.querySelectorAll(':checked')].map(e => e.value);
    if (verdict === 'rejected' && !reason_tags.length) throw new Error('Choose at least one rejection reason');
    const pending = recall('feedback-' + id, null);
    const value = { candidate_sha256: id, supersedes: human?.event_id ?? null, actor: 'human', verdict, reason_tags, note: $('note').value };
    const event = pending && JSON.stringify(pending.value) === JSON.stringify(value) ? pending : { value, event_id: uid() };
    remember('feedback-' + id, event);
    await api(`candidates/${id}/feedback`, { ...value, event_id: event.event_id });
    localStorage.removeItem('studio-feedback-' + id); await select(id); say('Human feedback saved to this exact take.');
  });
  if (c.evidence.cut) button('Export verified bundle', actions, async () => {
    say('Verifying complete bundle…');
    const response = await fetch(`/studio/candidates/${id}/export`);
    if (!response.ok) throw new Error((await response.json()).error);
    const url = URL.createObjectURL(await response.blob());
    const link = node('a', undefined, document.body, { href: url, download: id + '.tar' }); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    say('Verified bundle downloaded: prepared audio, original, provenance and feedback.');
  });
  const details = node('details', undefined, verdict); node('summary', 'Optional evidence details', details); node('pre', JSON.stringify(c, null, 2), details);
  renderLibrary();
}
$('blind').onchange = () => { remember('blind', $('blind').checked); if (selected) action(() => select(selected)); };
function renderLibrary() {
  $('library').replaceChildren();
  if (!candidates.length) node('p', 'No saved takes yet. Start with a prompt.', $('library'));
  for (const c of candidates) {
    const b = button(`${c.evidence.cut ? 'Prepared' : 'Original'} · ${c.candidate_sha256.slice(0,8)} · ${title(c)}`, $('library'), () => select(c.candidate_sha256));
    b.className = 'library-item'; b.setAttribute('aria-pressed', String(selected === c.candidate_sha256));
  }
}
async function refreshQa() {
  const ready = await api('readiness');
  const qa = ready.judge;
  $('qa-readiness').textContent = `QA setup: ${qa.status}. ${qa.progress || qa.error || 'Prepare the selected local CLAP model before automatic mode. Manual generation also runs setup.'}`;
}
$('setup-qa').onclick = () => action(async () => { await api('qa/setup', {}); await refreshQa(); });
$('cancel-qa').onclick = () => action(async () => { await api('qa/cancel', {}); await refreshQa(); });
function budgetText(job) {
  const seconds = (job.input.budget?.minutes ?? 0) * 60;
  const elapsed = job.budget_started_at ? Math.max(0, Math.floor((Date.now() - Date.parse(job.budget_started_at)) / 1000)) : 0;
  return `Budget: ${elapsed}s elapsed · ${Math.max(0, seconds - elapsed)}s remaining`;
}
async function refresh() {
  await refreshQa();
  const [nextJobs, nextCandidates, counts] = await Promise.all([api('jobs'), api('candidates'), api('evaluation')]);
  $('evaluation-counts').textContent = `${counts.status} · ${counts.human_labelled}/${counts.real_unique_audio} real clips labelled · ${counts.approved} approved · ${counts.rejected} rejected · ${counts.families} prompt families · ${counts.unreviewed} unreviewed · ${counts.disagreements} conflicting labels · ${counts.human_auto_disagreements} human/automatic disagreements · ${counts.corrections} corrections · ${counts.synthetic_candidates} synthetic candidates excluded. Missing: ${counts.missing.clips} clips, ${counts.missing.approved} approved, ${counts.missing.rejected} rejected, ${counts.missing.families} families.`;
  $('review-unreviewed').disabled = !counts.unreviewed_candidates.length;
  $('review-unreviewed').onclick = () => action(async () => { $('blind').checked = true; remember('blind', true); await select(counts.unreviewed_candidates[0]); $('workspace').focus(); });
  jobs = nextJobs;
  if (JSON.stringify(candidates) !== JSON.stringify(nextCandidates)) {
    candidates = nextCandidates; renderLibrary();
    const previous = $('compare').value; $('compare').replaceChildren(); node('option', 'Choose a comparison', $('compare'), { value: '' });
    for (const c of candidates) node('option', `${c.candidate_sha256.slice(0,8)} · ${title(c)}`, $('compare'), { value: c.candidate_sha256 });
    $('compare').value = previous;
  }
  const signature = JSON.stringify(jobs) + jobs.map(job => Boolean(job.budget_started_at && Date.now() - Date.parse(job.budget_started_at) >= job.input.budget.minutes * 60000)).join();
  if ($('jobs').dataset.signature === signature) {
    for (const job of jobs) $(`budget-${job.id}`).textContent = budgetText(job);
    return;
  }
  $('jobs').dataset.signature = signature; $('jobs').replaceChildren();
  if (!jobs.length) node('p', 'No requests yet.', $('jobs'));
  for (const job of [...jobs].sort((a, b) => b.started_at.localeCompare(a.started_at))) {
    const box = node('div', undefined, $('jobs'), { class: 'job' });
    node('p', job.input.request.prompt, box);
    node('p', `${job.id.slice(0,8)} · ${job.status} / ${job.outcome ?? 'pending'} · ${job.progress || 'queued'} · attempt ${job.attempt ?? 1}/${job.input.budget?.attempts ?? 1}`, box);
    node('p', budgetText(job), box, { id: `budget-${job.id}` });
    for (const attempt of job.attempts ?? []) node('p', `Seed ${attempt.seed}: ${attempt.reason}${attempt.result ? ' → ' + (attempt.result.outcome ?? attempt.result.evaluation?.verdict ?? 'needs_review') : ''}`, box);
    if (job.status === 'interrupted' && job.attempts) button('Recover saved candidate', box, async () => { await api(`jobs/${job.id}/recover`, {}); await refresh(); });
    if (job.error) node('p', job.error, box);
    if (job.status === 'interrupted') button('Acknowledge uncertain outcome', box, async () => {
      await api(`jobs/${job.id}/acknowledge`, {}); await refresh(); say('Interrupted outcome acknowledged. Evidence is preserved; a new request may now be started.');
    });
    if (['running', 'canceling'].includes(job.status)) button('Cancel job', box, async () => { await api(`jobs/${job.id}/cancel`, {}); await refresh(); say('Cancellation saved. Owned work is stopping or draining.'); });
    else if (!jobs.some(next => next.parent_id === job.id) && !job.resumed_by) {
      const exhausted = (job.attempt ?? 1) >= (job.input.budget?.attempts ?? 1) || job.status === 'exhausted' || job.budget_started_at && Date.now() - Date.parse(job.budget_started_at) >= job.input.budget.minutes * 60000;
      if (exhausted) {
        node('p', 'Budget exhausted. All takes remain available for review.', box);
        button('Continue with composer budget', box, async () => {
          const key = recall('continue-' + job.id, uid()); remember('continue-' + job.id, key);
          await api(`jobs/${job.id}/continue`, { budget: { attempts: Number($('attempts').value), minutes: Number($('minutes').value) } }, key);
          await refresh(); say('Additional budget recorded as a linked continuation.');
        });
      }
      else button(job.status === 'interrupted' ? 'Resume with new attempt' : 'Retry with new seed', box, async () => {
        const key = recall('retry-' + job.id, uid()); remember('retry-' + job.id, key);
        await api(`jobs/${job.id}/retry`, {}, key); await refresh(); say('New attempt saved; reconnecting will attach to it.');
      });
    }
    const c = ['running', 'canceling'].includes(job.status) ? job.candidate_ids.at(-1) : job.result?.candidate_sha256 ?? job.candidate_ids.at(-1);
    if (c) { node('p', `Current candidate: ${c.slice(0,8)}`, box); button('Listen to take', box, () => select(c)); }
    else if (!['running', 'canceling'].includes(job.status)) node('p', 'No playable take. Retry if budget remains, or start a new request.', box);
  }
}
$('compose').onsubmit = event => { event.preventDefault(); action(async () => {
  const prompt = [$('prompt').value.trim(), $('events').value ? `Intended event count: ${$('events').value}.` : '', $('constraints').value.trim() ? `Constraints: ${$('constraints').value.trim()}` : ''].filter(Boolean).join('\n');
  const input = { mode: $('mode').value, request: { prompt, duration_seconds: Number($('duration').value) }, budget: { attempts: Number($('attempts').value), minutes: Number($('minutes').value) } };
  const previous = recall('submission', null);
  const pending = previous && JSON.stringify(previous.input) === JSON.stringify(input) ? previous : { key: uid(), input };
  remember('submission', pending);
  const job = await api('jobs', pending.input, pending.key);
  localStorage.removeItem('studio-submission');
  await refresh(); say(`Request ${job.id.slice(0,8)} saved. Progress appears in request history; you can refresh safely.`);
}); };
async function connect() {
  const response = await fetch('/studio/session', { headers: { 'X-Studio-Bootstrap': '1' } });
  if (!response.ok) throw new Error('Local session unavailable'); csrf = (await response.json()).csrf;
  const ready = await api('readiness');
  $('readiness').textContent = ready.generation === 'fixture' ? 'Ready: controlled synthetic generation (technical review only).' : ready.generation === 'installed' ? 'Local model files present. Setup verifies readiness before generation.' : 'Setup required: local generation models or environment missing. Generate will run local setup first; allow up to 20 minutes.';
  await refresh();
  const id = recall('selected', null); if (candidates.some(c => c.candidate_sha256 === id)) await select(id);
  say('Connected. Saved requests and takes are available. Delivered clips receive experimental CLAP/signal evaluation; human decisions remain separate.');
}
$('export-evaluation').onclick = () => action(async () => {
  const response = await fetch('/studio/evaluation/export');
  if (!response.ok) throw new Error((await response.json()).error);
  const url = URL.createObjectURL(await response.blob());
  const link = node('a', undefined, document.body, { href: url, download: 'audio-factory-evaluation.json' });
  link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  say('Local evaluation dataset downloaded. Freeze family groups before tuning; quality remains unestablished.');
});
$('reconnect').onclick = () => action(connect);
renderLibrary();
action(connect);
setInterval(() => { if (!busy && csrf) action(refresh); }, 2000);
