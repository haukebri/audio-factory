const $ = id => document.getElementById(id);
let clips = [], selected, activeId = localStorage.getItem('scout-job'), busy = false, pending = false, searching = false, samples, loadVersion = 0, pollTimer;
const error = message => { $('error').textContent = message || ''; };
async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, { ...options, headers: { ...(options.method ? { 'X-Poc': '1' } : {}), ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function disable() {
  for (const id of ['import-button', 'upload-button', 'trim-button']) $(id).disabled = busy || pending || (id === 'trim-button' && !selected);
  $('search-button').disabled = searching;
}
function sourceTimes() { return { start: Number($('source-start').value), end: Number($('source-end').value) }; }
function validTimes({ start, end }, duration = Infinity) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start > 60 || end > duration + 0.00003) throw new Error('Choose an interval within the recording, up to 60 seconds.');
}
function draw() {
  const canvas = $('waveform'), dpr = devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(145 * dpr);
  const context = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  context.clearRect(0, 0, w, h);
  if (!samples || !selected) return;
  const start = Number($('trim-start').value) / selected.duration * w, end = Number($('trim-end').value) / selected.duration * w;
  context.fillStyle = '#27371a'; context.fillRect(start, 0, end - start, h);
  context.strokeStyle = '#d2fa6b'; context.lineWidth = dpr;
  context.beginPath();
  for (let x = 0; x < w; x += 2 * dpr) {
    const a = Math.floor(x / w * samples.length), b = Math.max(a + 1, Math.floor((x + 2 * dpr) / w * samples.length));
    let lo = 0, hi = 0; for (let i = a; i < b && i < samples.length; i++) { lo = Math.min(lo, samples[i]); hi = Math.max(hi, samples[i]); }
    context.moveTo(x, h / 2 + lo * h * .42); context.lineTo(x, h / 2 + hi * h * .42);
  }
  context.stroke(); context.strokeStyle = '#789950'; context.strokeRect(start, 0, end - start, h);
}
async function selectClip(clip) {
  selected = clip; localStorage.setItem('scout-clip', clip.id); const version = ++loadVersion;
  $('empty-editor').hidden = true; $('loaded-editor').hidden = false;
  $('clip-title').textContent = clip.title; $('duration').textContent = `${clip.duration.toFixed(3)} seconds`;
  $('player').pause(); $('player').src = clip.url; $('download').href = clip.url; $('download').download = `sound-${clip.id}.wav`;
  $('trim-start').value = 0; $('trim-end').value = clip.duration;
  $('trim-start').max = $('trim-end').max = clip.duration;
  $('gain').value = 0; $('gain-value').value = '0 dB'; samples = null; draw(); renderClips(); disable();
  let context;
  try {
    const response = await fetch(clip.url); if (!response.ok) throw new Error('Could not load saved audio.');
    const bytes = await response.arrayBuffer(); context = new AudioContext(); const decoded = await context.decodeAudioData(bytes);
    if (version === loadVersion) { samples = decoded.getChannelData(0); draw(); }
  } catch (e) { if (version === loadVersion) error(`Waveform unavailable: ${e.message}`); }
  finally { await context?.close(); }
}
function renderClips() {
  $('clip-count').textContent = `${clips.length} saved`; $('clips').replaceChildren();
  if (!clips.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Saved WAVs stay here after a restart.'; $('clips').append(p); }
  for (const clip of clips) {
    const button = document.createElement('button'); button.className = `clip-card${clip.id === selected?.id ? ' active' : ''}`; button.type = 'button'; button.textContent = clip.title;
    button.setAttribute('aria-pressed', String(clip.id === selected?.id));
    const details = document.createElement('span'); details.textContent = `${clip.duration.toFixed(2)}s · WAV · Open clip ↗`; button.append(details);
    button.onclick = () => selectClip(clip); $('clips').append(button);
  }
}
function renderJob(job) {
  busy = job?.status === 'running'; $('progress').hidden = !busy;
  if (busy) { $('stage').textContent = job.stage; $('elapsed').textContent = `${Math.max(0, Math.floor((Date.now() - Date.parse(job.started_at)) / 1000))}s`; }
  else if (job) {
    localStorage.removeItem('scout-job'); activeId = null;
    if (job.status === 'completed') { error(''); if (job.clip) selectClip(job.clip); }
    else error(job.error || `Operation ${job.status}.`);
  }
  disable();
}
async function refresh() {
  clearTimeout(pollTimer);
  try {
    const state = await api('state');
    $('readiness').textContent = state.ready ? '● Tools ready' : 'Tools need setup';
    $('readiness').title = state.tools.map(t => `${t.name}: ${t.error || t.version}`).join('\n');
    const changed = JSON.stringify(clips) !== JSON.stringify(state.clips); clips = state.clips; if (changed) renderClips();
    const job = state.jobs.find(j => j.id === activeId) || state.jobs.find(j => j.status === 'running');
    if (job) { activeId = job.id; localStorage.setItem('scout-job', activeId); renderJob(job); }
    else { if (activeId) error('Previous operation is no longer available. You can submit it again.'); activeId = null; localStorage.removeItem('scout-job'); renderJob(null); }
    if (!selected && clips.length) selectClip(clips.find(c => c.id === localStorage.getItem('scout-clip')) || clips[0]);
  } catch (e) { $('readiness').textContent = 'Disconnected · retrying'; }
  if (activeId || busy || $('readiness').textContent.startsWith('Disconnected')) pollTimer = setTimeout(refresh, 1000);
}
async function submit(path, options) {
  error(''); pending = true; disable();
  if (path.startsWith('upload')) { $('progress').hidden = false; $('stage').textContent = 'Uploading local file…'; $('elapsed').textContent = ''; }
  try {
    const job = await api(path, options); activeId = job.id; localStorage.setItem('scout-job', activeId);
    renderJob(job); await refresh();
  } catch (e) { error(e.message); await refresh(); }
  finally { pending = false; disable(); }
}
function previewVideo(result, autoplay = false) {
  $('player').pause();
  $('video-url').value = result.url;
  $('preview-title').textContent = result.title;
  $('youtube-player').title = result.title;
  $('youtube-player').src = `https://www.youtube.com/embed/${result.id}?${new URLSearchParams({ autoplay: autoplay ? '1' : '0', playsinline: '1' })}`;
  $('preview-external').href = result.url;
  $('video-preview').hidden = false;
}
function closePreview() {
  $('youtube-player').removeAttribute('src');
  $('video-preview').hidden = true;
}
$('close-preview').onclick = closePreview;
$('player').addEventListener('play', closePreview);
$('search-form').onsubmit = async event => {
  event.preventDefault(); searching = true; disable(); $('search-message').textContent = 'Searching YouTube…'; $('results').replaceChildren(); closePreview();
  try {
    const { results } = await api('search', { method: 'POST', body: JSON.stringify({ query: $('query').value.trim() }) });
    $('search-message').textContent = results.length ? `${results.length} videos. Play a result here, then choose the useful seconds.` : 'No results. Try different wording or paste a URL.';
    for (const result of results) {
      const row = document.createElement('div'); row.className = 'result'; const text = document.createElement('div'); text.className = 'result-text';
      const title = document.createElement('p'); title.className = 'result-title'; title.textContent = result.title;
      const button = document.createElement('button'); button.textContent = 'Play here'; button.onclick = () => previewVideo(result, true);
      text.append(title); row.append(text, button); $('results').append(row);
    }
    if (results.length) previewVideo(results[0]);
  } catch (e) { $('search-message').textContent = `Search failed: ${e.message} You can still paste a video URL.`; }
  finally { searching = false; disable(); }
};
$('import-form').onsubmit = event => { event.preventDefault(); try { const times = sourceTimes(); validTimes(times); if (!$('video-url').value.trim()) throw new Error('Paste a YouTube video URL.'); submit('import', { method: 'POST', body: JSON.stringify({ url: $('video-url').value, ...times }) }); } catch (e) { error(e.message); } };
$('upload-button').onclick = () => { try { const times = sourceTimes(); validTimes(times); const file = $('local-file').files[0]; if (!file) throw new Error('Choose a local audio or video file.'); if (file.size > 256 * 1024 * 1024) throw new Error('Choose a file smaller than 256 MiB.'); submit(`upload?${new URLSearchParams(times)}`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } }); } catch (e) { error(e.message); } };
$('trim-form').onsubmit = event => { event.preventDefault(); try { const times = { start: Number($('trim-start').value), end: Number($('trim-end').value) }; validTimes(times, selected.duration); submit(`clips/${selected.id}/trim`, { method: 'POST', body: JSON.stringify({ ...times, gain: Number($('gain').value) }) }); } catch (e) { error(e.message); } };
$('cancel-button').onclick = async () => { if (!activeId) return; try { await api(`jobs/${activeId}`, { method: 'DELETE' }); await refresh(); } catch (e) { error(e.message); } };
$('repeat').onchange = () => { $('player').loop = $('repeat').checked; };
$('gain').oninput = () => { $('gain-value').value = `${$('gain').value > 0 ? '+' : ''}${$('gain').value} dB`; };
$('trim-start').oninput = $('trim-end').oninput = draw;
window.addEventListener('resize', draw); disable(); refresh();
