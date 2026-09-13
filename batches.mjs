import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash, root as factoryRoot, validateRequest } from './dist/config.js';
import { atomicJson } from './dist/service.js';
import { importInput } from './youtube.mjs';
import { workflowInput } from './workflow.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const keyPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const durationOptions = [5, 10, 20, 30, 60];
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
function request(input) {
  if (!plain(input) || Object.keys(input).some(k => !['prompt', 'duration_seconds', 'loop'].includes(k)) || !validateRequest(input)) fail(400, 'Expected prompt, duration_seconds and optional boolean loop');
  const result = { prompt: input.prompt, duration_seconds: input.duration_seconds ?? 5, ...(input.loop ? { loop: true } : {}) };
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
  const interrupted = () => jobs.list().some(j => j.status === 'interrupted' && j.provider !== 'youtube');
  const selection = sound => jobs.store.selectionHistory(soundId(sound)).at(-1) ?? null;
  function describe(batch) {
    const sounds = batch.sounds.map(s => {
      const operations = s.operations.map(o => ({ ...o, status: jobFor(o)?.status ?? (o.canceled_at ? 'canceled' : o.error ? 'failed' : batch.paused ? 'paused' : 'queued'), error: jobFor(o)?.error ?? o.error ?? null }));
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
      const existing = jobFor(op);
      if (existing?.provider === 'youtube' && existing.status === 'interrupted') { await jobs.recover(existing.id); return; }
      if (existing || op.error || op.canceled_at) continue;
      try { await serial(async () => {
        const current = item(get(batch.id), sound.key).operations.find(o => o.key === op.key);
        if (!get(batch.id).paused && !current.canceled_at) await jobs.submit(op.key, op.input);
      }); }
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
      const effective = typeof value === "function" ? value(sound) : value;
      const signature = hash(JSON.stringify(effective));
      const existing = [...batches.values()].flatMap(b => b.sounds.flatMap(s => s.operations)).find(o => o.idempotency_key === key);
      if (existing) {
        if (existing.signature !== signature || !sound.operations.includes(existing)) fail(409, 'Idempotency key conflict');
        return describe(original);
      }
      const batch = structuredClone(original), target = item(batch, assetKey);
      const input = build(target, effective);
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
      request(input);
      return append(id, assetKey, key, sound => {
        const accepted = sound.operations.find(o => o.idempotency_key === key);
        const inherited = (accepted ?? sound.operations.findLast(o => o.input.provider !== 'youtube')).input.request.loop ?? false;
        return { kind: 'revise', request: request({ ...input, loop: input.loop ?? inherited }) };
      }, (sound, value) => {
        if (!jobs.get(soundId(sound))) fail(409, 'Wait for the first generation to start');
        return { request: { ...value.request, loop: value.request.loop === true }, provider: 'local', sound_parent_id: soundId(sound) };
      });
    },
    youtube(id, assetKey, key, input) {
      const interval = importInput(input);
      return append(id, assetKey, key, { kind: 'youtube', ...interval }, sound => {
        if (!jobs.get(soundId(sound))) fail(409, 'Wait for this sound’s first request to start');
        const intent = sound.operations.findLast(o => o.input.provider !== 'youtube')?.input.request ?? sound.request;
        return { provider: 'youtube', request: { prompt: intent.prompt, duration_seconds: intent.duration_seconds,
          ...(intent.loop ? { loop: true } : {}) }, import: interval, sound_parent_id: soundId(sound) };
      });
    },
    queuedJob(id) {
      for (const batch of batches.values()) for (const sound of batch.sounds) {
        const op = sound.operations.find(o => o.job_id === id);
        if (op) return { id, sound_id: soundId(sound), input: op.input, provider: op.input.provider,
          status: op.canceled_at ? 'canceled' : op.error ? 'failed' : batch.paused ? 'paused' : 'queued',
          candidate_ids: [], started_at: op.created_at, error: op.error ?? null };
      }
    },
    cancelQueued(id) {
      return serial(async () => {
        if (jobs.get(id)) return jobs.cancel(id);
        for (const original of batches.values()) {
          const batch = structuredClone(original);
          const op = batch.sounds.flatMap(s => s.operations).find(o => o.job_id === id);
          if (!op || op.input.provider !== 'youtube') continue;
          op.canceled_at ??= new Date().toISOString(); await persist(batch);
          return this.queuedJob(id);
        }
        fail(404, 'Unknown queued import');
      });
    },
    recreate(id, assetKey, key, input) {
      if (!plain(input) || Object.keys(input).some(k => !['candidate_sha256', 'loop'].includes(k)) || (input.loop !== undefined && typeof input.loop !== 'boolean') || typeof input.candidate_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.candidate_sha256)) fail(400, 'Expected candidate_sha256');
      const c = jobs.store.loadCandidate(input.candidate_sha256);
      const owner = jobs.list().find(j => j.candidate_ids.includes(c.candidate_sha256) || j.attempts?.some(a => a.id === c.attempt_id));
      const loop = input.loop ?? (c.evidence.generation.runtime.backend === 'youtube' ? owner?.input.request.loop ?? false : c.evidence.cut?.request?.loop ?? c.evidence.generation.request.loop ?? false);
      return append(id, assetKey, key, { kind: 'recreate', candidate_sha256: input.candidate_sha256, ...(loop ? { loop: true } : {}) }, sound => {
        if (!owner || (owner.sound_id ?? owner.id) !== soundId(sound)) fail(400, 'Candidate does not belong to this batch sound');
        const intent = c.evidence.generation.runtime.backend === 'youtube' ? owner.input.request : c.evidence.generation.request;
        return { provider: 'elevenlabs', request: { prompt: intent.prompt, duration_seconds: intent.duration_seconds, loop }, recreation_parent: c.candidate_sha256 };
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
          duration_seconds: cut ? (cut.loop?.output_frames ?? (cut.bounds.end_sample - cut.bounds.start_sample)) / cut.bounds.sample_rate : c.evidence.generation.audio.seconds,
          loop: cut ? cut.request.loop === true : c.evidence.generation.request.loop === true,
          prompt: c.evidence.generation.request.prompt, requested_duration_seconds: c.evidence.generation.request.duration_seconds,
          audio_url: `${origin}/studio/candidates/${c.candidate_sha256}/${cut ? 'audio' : 'source'}`,
          export_url: `${origin}/studio/candidates/${c.candidate_sha256}/export` };
      });
      return { batch_id: id, revision: hash(JSON.stringify(sounds.map(s => [s.key, s.candidate_sha256, s.selection_event_id, s.audio_sha256]))), sounds };
    },
    async close() { closed = true; clearInterval(timer); await pumping; await writes; },
  };
}
