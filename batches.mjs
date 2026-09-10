import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash, root as factoryRoot, validateRequest } from './dist/config.js';
import { atomicJson } from './dist/service.js';
import { workflowInput } from './workflow.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const keyPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const durationOptions = [5, 10, 20, 30, 60];
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
function request(input) {
  if (!plain(input) || Object.keys(input).some(k => !['prompt', 'duration_seconds'].includes(k)) || !validateRequest(input)) fail(400, 'Expected prompt and duration_seconds');
  const result = { prompt: input.prompt, duration_seconds: input.duration_seconds ?? 5 };
  if (!durationOptions.includes(result.duration_seconds)) fail(400, 'Duration must be 5, 10, 20, 30 or 60 seconds');
  return result;
}
function batchInput(input) {
  if (!plain(input) || Object.keys(input).sort().join() !== 'name,sounds' || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 || !Array.isArray(input.sounds) || !input.sounds.length || input.sounds.length > 50) fail(400, 'Expected a name and 1–50 sounds');
  const sounds = input.sounds.map(s => {
    if (!plain(s) || typeof s.key !== 'string' || !keyPattern.test(s.key)) fail(400, 'Each sound needs a unique asset key (letters, digits, underscore or hyphen)');
    const { key, ...value } = s;
    return { key, ...request(value) };
  });
  if (new Set(sounds.map(s => s.key)).size !== sounds.length) fail(400, 'Duplicate sound key');
  return { name: input.name, sounds };
}

// One durable queue over the existing single-compute workflow. No separate worker process.
export async function openBatches(jobs, { root = factoryRoot, origin }) {
  const directory = join(root, '.runtime/studio/batches');
  await mkdir(directory, { recursive: true });
  const batches = new Map();
  for (const name of (await readdir(directory)).filter(n => /^[a-f0-9]{32}\.json$/.test(n)).sort()) {
    const batch = JSON.parse(await readFile(join(directory, name), 'utf8'));
    if (name !== `${batch.id}.json` || batch.version !== 1 || hash(JSON.stringify(batchInput(batch.input))) !== batch.signature) throw new Error('Invalid saved batch');
    batches.set(batch.id, batch);
  }
  let writes = Promise.resolve(), pumping, closed = false, queueError;
  const persist = async batch => { await atomicJson(join(directory, batch.id + '.json'), batch); batches.set(batch.id, batch); };
  const serial = operation => {
    const result = writes.then(() => { if (closed) fail(503, 'Batch queue stopping'); return operation(); });
    writes = result.catch(() => {}); return result;
  };
  const get = id => batches.get(id) ?? fail(404, 'Unknown batch');
  const item = (batch, key) => batch.sounds.find(s => s.key === key) ?? fail(404, 'Unknown batch sound');
  const jobFor = operation => {
    const job = jobs.get(operation.job_id);
    if (job && job.signature !== hash(JSON.stringify(workflowInput(operation.input)))) fail(409, 'Queued job identity conflict');
    return job;
  };
  const soundId = sound => sound.operations[0].job_id;
  const interrupted = () => jobs.list().some(j => j.status === 'interrupted');
  const selection = sound => jobs.store.selectionHistory(soundId(sound)).at(-1) ?? null;
  function describe(batch) {
    const sounds = batch.sounds.map(s => {
      const operations = s.operations.map(o => ({ ...o, status: jobFor(o)?.status ?? (o.error ? 'failed' : batch.paused ? 'paused' : 'queued'), error: jobFor(o)?.error ?? o.error ?? null }));
      const chosen = selection(s);
      const pending = operations.some(o => ['running', 'canceling', 'queued', 'paused', 'interrupted'].includes(o.status));
      return { key: s.key, original_request: s.request, sound_id: soundId(s), selection: chosen, operations,
        status: pending ? 'generating' : chosen ? 'selected' : operations.some(o => o.status === 'completed') ? 'awaiting_review' : 'needs_attention' };
    });
    const selected = sounds.filter(s => s.selection).length;
    const generating = sounds.some(s => s.status === 'generating');
    const blocked = generating && (interrupted() || Boolean(queueError));
    return { id: batch.id, name: batch.input.name, created_at: batch.created_at, paused: batch.paused,
      status: batch.paused ? 'paused' : blocked ? 'blocked' : generating ? 'generating' : selected === sounds.length ? 'ready' : 'awaiting_review',
      queue_error: queueError ?? (blocked ? 'Interrupted work requires explicit recovery or acknowledgement in Studio' : null),
      progress: { selected, total: sounds.length }, review_url: `${origin}/#batch/${batch.id}`, sounds };
  }
  async function pump() {
    if (closed || queueError || jobs.busy() || interrupted()) return;
    const queued = [...batches.values()].filter(b => !b.paused).flatMap(batch => batch.sounds.flatMap(sound => sound.operations.map(op => ({ batch, sound, op })))).sort((a,b) => a.op.created_at.localeCompare(b.op.created_at));
    for (const { batch, sound, op } of queued) {
      if (jobFor(op) || op.error) continue;
      try { await jobs.submit(op.key, op.input); }
      catch (error) {
        if ([429, 409].includes(error.status)) return;
        // Record a pre-submission failure once; never invent a replacement key.
        await serial(async () => { const next = structuredClone(get(batch.id)); item(next, sound.key).operations.find(o => o.key === op.key).error = String(error); await persist(next); });
      }
      return;
    }
  }

  const tick = () => { if (!pumping && !closed) pumping = pump().catch(e => { queueError = String(e); }).finally(() => { pumping = undefined; }); };
  const timer = setInterval(tick, 500);
  function operation(batchId, soundIndex, revision, input, idempotencyKey, signature) {
    const key = `batch-${batchId}-${soundIndex}-${revision}`;
    return { key, job_id: hash(key).slice(0,32), input, idempotency_key: idempotencyKey, signature, created_at: new Date().toISOString() };
  }
  const checkKey = key => { if (typeof key !== 'string' || !keyPattern.test(key)) fail(400, 'Idempotency-Key required'); };
  function append(id, assetKey, key, value, build) {
    checkKey(key);
    return serial(async () => {
      const original = get(id), sound = item(original, assetKey);
      const signature = hash(JSON.stringify(value));
      const existing = original.sounds.flatMap(s => s.operations).find(o => o.idempotency_key === key);
      if (existing) {
        if (existing.signature !== signature || !sound.operations.includes(existing)) fail(409, 'Idempotency key conflict');
        return describe(original);
      }
      const batch = structuredClone(original), target = item(batch, assetKey);
      const input = build(target);
      workflowInput(input);
      target.operations.push(operation(id, batch.sounds.indexOf(target), target.operations.length, input, key, signature));
      await persist(batch); tick(); return describe(batch);
    });
  }
  return {
    list: () => [...batches.values()].map(describe), get: id => describe(get(id)),
    submit(key, input) {
      checkKey(key); input = batchInput(input);
      return serial(async () => {
        const id = hash(key).slice(0,32), signature = hash(JSON.stringify(input)), existing = batches.get(id);
        if (existing) { if (existing.signature !== signature) fail(409, 'Idempotency key conflict'); return describe(existing); }
        const batch = { version: 1, id, signature, input, created_at: new Date().toISOString(), paused: false,
          sounds: input.sounds.map(({ key: assetKey, ...value }, index) => ({ key: assetKey, request: value,
            operations: [operation(id, index, 0, { request: value, provider: 'local' }, null, null)] })) };
        await persist(batch); tick(); return describe(batch);
      });
    },
    revise(id, assetKey, key, input) {
      const value = request(input);
      return append(id, assetKey, key, { kind: 'revise', request: value }, sound => {
        if (!jobs.get(soundId(sound))) fail(409, 'Wait for the first generation to start');
        return { request: value, provider: 'local', sound_parent_id: soundId(sound) };
      });
    },
    recreate(id, assetKey, key, input) {
      if (!plain(input) || Object.keys(input).join() !== 'candidate_sha256' || typeof input.candidate_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.candidate_sha256)) fail(400, 'Expected candidate_sha256');
      return append(id, assetKey, key, { kind: 'recreate', ...input }, sound => {
        const c = jobs.store.loadCandidate(input.candidate_sha256);
        const owner = jobs.list().find(j => j.candidate_ids.includes(c.candidate_sha256) || j.attempts?.some(a => a.id === c.attempt_id));
        if (!owner || (owner.sound_id ?? owner.id) !== soundId(sound)) fail(400, 'Candidate does not belong to this batch sound');
        return { provider: 'elevenlabs', request: { prompt: c.evidence.generation.request.prompt, duration_seconds: c.evidence.generation.request.duration_seconds }, recreation_parent: c.candidate_sha256 };
      });
    },
    pause(id, paused) {
      return serial(async () => {
        const batch = structuredClone(get(id)); batch.paused = paused; await persist(batch);
        // Finish the accepted operation; pause prevents starting any further queued operation.
        tick(); return describe(batch);
      });
    },
    winners(id) {
      const batch = get(id), state = describe(batch);
      if (state.status !== 'ready') fail(409, 'Batch is not ready; inspect batch status and select a winner for every sound');
      const sounds = batch.sounds.map(s => {
        const selected = selection(s), c = jobs.store.loadCandidate(selected.candidate_sha256), cut = c.evidence.cut;
        return { key: s.key, candidate_sha256: c.candidate_sha256, selection_event_id: selected.event_id,
          audio_sha256: cut?.audio_sha256 ?? c.evidence.generation.audio_sha256,
          duration_seconds: cut ? (cut.bounds.end_sample - cut.bounds.start_sample) / cut.bounds.sample_rate : c.evidence.generation.audio.seconds,
          prompt: c.evidence.generation.request.prompt, requested_duration_seconds: c.evidence.generation.request.duration_seconds,
          audio_url: `${origin}/studio/candidates/${c.candidate_sha256}/${cut ? 'audio' : 'source'}`,
          export_url: `${origin}/studio/candidates/${c.candidate_sha256}/export` };
      });
      return { batch_id: id, revision: hash(JSON.stringify(sounds.map(s => [s.key, s.candidate_sha256, s.selection_event_id, s.audio_sha256]))), sounds };
    },
    async close() { closed = true; clearInterval(timer); await pumping; await writes; },
  };
}
