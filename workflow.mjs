import { execFileSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { GgufBackend } from "./dist/backend.js";
import { ElevenLabsBackend, elevenKey } from "./dist/elevenlabs.js";
import { config, hash, root as factoryRoot, validateRequest } from "./dist/config.js";
import { acquireCompute, processIdentity } from "./dist/ownership.js";
import { qaRequest, qaOperation } from "./dist/qa.js";
import { atomicJson, createFactory } from "./dist/service.js";
import { ensureSetup } from "./dist/setup.js";
import { preparePromptPlan } from './prompt-plan.mjs';
import { inspectWav } from "./dist/wav.js";
import { acquire, importInput, recoverAcquisition, publicError } from "./youtube.mjs";
import { openReviewStore } from "./review-store.mjs";

export function workflowInput(input) {
  if (input?.provider === 'youtube') {
    if (Object.keys(input).some(k => !['provider', 'request', 'import', 'sound_parent_id'].includes(k)) ||
        !validateRequest(input.request) || input.request.seed !== undefined || !/^[a-f0-9]{32}$/.test(input.sound_parent_id ?? ''))
      throw Object.assign(new Error('Expected a YouTube interval and existing sound intent'), { status: 400 });
    return { provider: 'youtube', request: { prompt: input.request.prompt, duration_seconds: input.request.duration_seconds ?? 5,
      ...(input.request.loop ? { loop: true } : {}) }, import: importInput(input.import), sound_parent_id: input.sound_parent_id };
  }
  if (!input || Object.keys(input).some(key => !["request", "qa", "mode", "provider", "sound_parent_id", "recreation_parent"].includes(key)) || !validateRequest(input.request))
    throw new Error("Invalid workflow request; semantic QA and search budgets were removed. Use the five-variant local workflow or provider: elevenlabs.");
  if (input.mode !== undefined && input.mode !== 'manual') throw new Error('Semantic QA modes were removed');
  qaRequest('analyses', input.qa ?? { clap: false });
  for (const [key, length] of [['sound_parent_id', 32], ['recreation_parent', 64]])
    if (input[key] !== undefined && (typeof input[key] !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(input[key]))) throw new Error(`Invalid ${key}`);
  // False and omission keep historical signatures; true adds a distinct effective intent.
  const request = { ...input.request };
  if (request.loop === false) delete request.loop;
  const provider = input.provider ?? 'local';
  if (!['local', 'elevenlabs'].includes(provider)) throw new Error('Unknown generation provider');
  if (provider === 'elevenlabs' && input.request.duration_seconds > 30) throw Object.assign(new Error('ElevenLabs supports a maximum of 30 seconds; use local generation for 60 seconds'), { status: 400 });
  if (input.recreation_parent && provider !== 'elevenlabs') throw new Error('Recreation requires ElevenLabs');
  return { request: { ...request, duration_seconds: input.request.duration_seconds ?? config.default_duration_seconds }, provider,
    ...(input.sound_parent_id ? { sound_parent_id: input.sound_parent_id } : {}), ...(input.recreation_parent ? { recreation_parent: input.recreation_parent } : {}) };
}

// Acquisition shares the candidate store and cut renderer; it never enters generation.
export async function runYoutube(job, { root, store, save, signal, acquireYoutube = acquire, setup = ensureSetup, fixture = false }) {
  const attempt = job.attempts[0];
  const claim = acquireCompute();
  let temporary;
  const temporaryPrefix = `youtube-import-${job.id}-`;
  const stage = async progress => { signal.throwIfAborted(); job.progress = progress; await save(); };
  const preserve = async (evidence, source, audio = null) => {
    const c = store.saveCandidate({ attempt_id: attempt.id, fixture, evidence, evaluation: null }, source, audio);
    if (!job.candidate_ids.includes(c.candidate_sha256)) job.candidate_ids.push(c.candidate_sha256);
    attempt.candidate_id = c.candidate_sha256;
    await save();
    return c;
  };
  try {
    await recoverAcquisition(root, job.id);
    for (const name of await readdir(join(root, '.runtime'))) if (name.startsWith(temporaryPrefix)) await rm(join(root, '.runtime', name), { recursive: true, force: true });
    // Candidate publication is atomic and may precede its job checkpoint.
    const saved = store.listCandidates().filter(c => c.attempt_id === attempt.id);
    for (const c of saved) if (!job.candidate_ids.includes(c.candidate_sha256)) job.candidate_ids.push(c.candidate_sha256);
    let candidate = saved.find(c => c.evidence.cut?.request.start_seconds === 0 && c.evidence.cut.request.end_seconds === c.evidence.generation.audio.seconds && c.evidence.cut.request.loop === false) ?? saved.find(c => !c.evidence.cut);
    if (!candidate) {
      temporary = await mkdtemp(join(root, '.runtime', temporaryPrefix));
      const result = await acquireYoutube(job.input.import, temporary, { signal, stage, owner: { root, job_id: job.id } });
      const source = await readFile(result.file), audio = inspectWav(source);
      if (Math.round(audio.seconds * 44100) !== Math.round((job.input.import.end_seconds - job.input.import.start_seconds) * 44100))
        throw new Error('Decoded audio does not cover the requested interval');
      const generation = { schema: 'urban:audio-factory-run@1', id: attempt.id, signature: job.signature,
        status: 'completed', request: { prompt: job.input.request.prompt, duration_seconds: audio.seconds, loop: false },
        started_at: job.started_at, finished_at: new Date().toISOString(), elapsed_ms: Date.now() - Date.parse(job.started_at),
        audio_path: `out/runs/${attempt.id}/audio.wav`, audio, audio_sha256: hash(source),
        models: [], licenses: [], runtime: { backend: 'youtube' }, settings: { postprocess: 'full-interval-pcm16-v1' },
        review: 'Imported interval; awaiting human selection' };
      signal.throwIfAborted();
      candidate = await preserve({ generation, analyses: [], cut_failure: null, reason: 'Imported source retained before delivery' }, source);
    }
    if (!candidate.evidence.cut) {
      await stage('Preparing audio');
      await setup(false, signal, claim.name);
      temporary ??= await mkdtemp(join(root, '.runtime', temporaryPrefix));
      const run = candidate.evidence.generation, directory = join(temporary, 'out/runs', run.id);
      await mkdir(directory, { recursive: true });
      const source = store.readAsset(candidate.candidate_sha256, 'source');
      await writeFile(join(directory, 'run.json'), JSON.stringify(run));
      await writeFile(join(directory, 'audio.wav'), source);
      signal.throwIfAborted();
      const cut = await qaOperation(temporary, run.id, 'cuts', { start_seconds: 0, end_seconds: run.audio.seconds, loop: false }, signal);
      if (cut.status !== 'completed') throw new Error(cut.error ?? 'Import delivery failed');
      signal.throwIfAborted();
      candidate = await preserve(JSON.parse(await readFile(cut.delivery.metadata, 'utf8')), source, await readFile(cut.delivery.audio));
    }
    return { id: attempt.id, candidate_sha256: candidate.candidate_sha256,
      audio: join(root, '.runtime/studio/candidates', candidate.candidate_sha256, 'audio.wav'),
      evaluation: null, outcome: 'needs_review', reason_tags: [] };
  } catch (error) { throw Object.assign(new Error(publicError(error)), { status: error.status }); }
  finally { if (temporary) await rm(temporary, { recursive: true, force: true }); claim.release(); }
}

// The CLI and studio both use this single setup/generation/QA/cut/bundle workflow.
export async function runWorkflow(job, { root, token, store, save, signal, backend = job.provider === "elevenlabs" ? new ElevenLabsBackend({ root }) : new GgufBackend(), setup = ensureSetup, computePort = config.port, fixture = false }) {
  const attempt = job.attempts?.at(-1) ?? (job.checkpoint ??= { id: job.id, seed: job.input.request.seed });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel);
  if (signal.aborted) cancel();
  const operationSignal = controller.signal;
  const abort = () => { void (backend.cancel ? backend.cancel() : backend.stop?.()); };
  operationSignal.addEventListener('abort', abort);
  let ready = false;
  const factory = await createFactory({ root, token, backend, fresh: true, ready: () => ready, computeBusy: () => job.progress !== 'generating' });
  const checkBudget = () => operationSignal.throwIfAborted();
  const stage = async status => {
    checkBudget();
    if (factory.busy()) throw new Error('Another accepted compute operation must finish before workflow recovery');
    job.progress = status; attempt.inflight = status; await save();
    operationSignal.throwIfAborted();
  };
  const preserve = async (evidence, source, audio = null, evaluation = null) => {
    if (job.prompt_plan && backend.provider !== "elevenlabs") evidence = { ...evidence, generation: { ...evidence.generation, prompt_plan: job.prompt_plan } };
    const candidate = store.saveCandidate({ attempt_id: attempt.id, fixture, evidence, evaluation }, source, audio);
    if (!job.candidate_ids.includes(candidate.candidate_sha256)) job.candidate_ids.push(candidate.candidate_sha256);
    attempt.candidate_id = candidate.candidate_sha256;
    attempt.inflight = null;
    await save();
    return candidate;
  };
  try {
    const computeClaim = backend.reserve?.();
    await new Promise((resolve, reject) => { factory.server.once('error', reject); factory.server.listen(computePort, '127.0.0.1', resolve); });
    // Candidate publication may have completed just before the job checkpoint write.
    const saved = store.listCandidates().filter(c => c.attempt_id === attempt.id);
    for (const c of saved) if (!job.candidate_ids.includes(c.candidate_sha256)) job.candidate_ids.push(c.candidate_sha256);
    let candidate = attempt.candidate_id ? store.loadCandidate(attempt.candidate_id) : null;
    const matchingCut = saved.filter(c => c.evidence.cut && (!attempt.cut_input || isDeepStrictEqual(c.evidence.cut.request, attempt.cut_input)));
    candidate = matchingCut.find(c => c.evaluation) ?? matchingCut[0] ??
      (candidate?.evidence.cut ? candidate : null) ?? saved.filter(c => !c.evidence.cut).sort((a,b) => b.evidence.analyses.length - a.evidence.analyses.length)[0] ?? candidate;
    const key = attempt.id;
    const runId = hash(key).slice(0, 32);
    if (!candidate && attempt.inflight === 'generating') {
      const generation = JSON.parse(await readFile(join(root, 'out/runs', runId, 'run.json'), 'utf8'));
      candidate = await preserve({ generation, analyses: [], cut_failure: null, reason: 'Recovered completed generation' }, await readFile(join(root, generation.audio_path)));
    }
    if (attempt.inflight === 'setup' || candidate && (
      attempt.inflight === 'generating' ||
      attempt.inflight === 'analyzing' && candidate.evidence.analyses.length ||
      attempt.inflight === 'cutting' && candidate.evidence.cut && isDeepStrictEqual(candidate.evidence.cut.request, attempt.cut_input ?? {}) ||
      attempt.inflight === 'evaluating' && candidate.evaluation
    )) attempt.inflight = null;
    if (attempt.inflight && !candidate) throw new Error('Interrupted operation has no verified result; explicit new attempt required');
    if (!candidate) {
      await stage('setup');
      if (!job.setup_completed) {
        await setup(job.provider === 'local', operationSignal, computeClaim);
        job.setup_completed = true;
      }
      attempt.inflight = null;
      await save();
    }
    if (!candidate) {
      await backend.start?.();
      operationSignal.throwIfAborted();
      const preserved = new Set(store.listCandidates().map(c => c.evidence.generation.id));
      for (const id of await readdir(join(root, 'out/runs'))) {
        if (!/^[a-f0-9]{32}$/.test(id)) continue;
        let generation;
        try { generation = JSON.parse(await readFile(join(root, 'out/runs', id, 'run.json'), 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (generation.status === 'completed' && !preserved.has(id)) store.saveCandidate({ attempt_id: id, fixture, evaluation: null,
          evidence: { generation, analyses: [], cut_failure: null, reason: 'Recovered source before temporary session cleanup' } }, await readFile(join(root, 'out/runs', id, 'audio.wav')));
      }
      await factory.beginSession(); ready = true;
      await stage('generating');
      const response = await fetch(`http://127.0.0.1:${factory.server.address().port}/v1/sound-effects`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ ...job.input.request, prompt: job.variants[attempt.variant_index].prompt, seed: attempt.seed }), signal: AbortSignal.timeout(config.timeout_ms + 30000),
      });
      const responseBytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok) {
        let detail;
        try { detail = JSON.parse(responseBytes.toString('utf8')).error; } catch {}
        throw new Error(detail ?? `Generation failed: ${response.status}`);
      }
      const generation = JSON.parse(await readFile(join(root, 'out/runs', runId, 'run.json'), 'utf8'));
      candidate = await preserve({ generation, analyses: [], cut_failure: null, reason: 'Source preserved before QA' }, await readFile(join(root, generation.audio_path)));
    }
    const generation = candidate.evidence.generation;
    const source = store.readAsset(candidate.candidate_sha256, 'source');
    const directory = join(root, 'out/runs', generation.id);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'run.json'), JSON.stringify(generation));
    await writeFile(join(directory, 'audio.wav'), source);
    for (const report of candidate.evidence.analyses) {
      await mkdir(join(directory, 'analyses', report.id), { recursive: true });
      await writeFile(join(directory, 'analyses', report.id, 'report.json'), JSON.stringify(report));
    }
    let analysis = candidate.evidence.analyses.at(-1);
    const qa = async (kind, input) => {
      if (attempt.inflight) {
        // Reuse completed reports; never let qaOperation retry an uncertain subprocess.
        const reports = await readdir(join(directory, kind)).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
        for (const id of reports) {
          let report;
          try { report = JSON.parse(await readFile(join(directory, kind, id, 'report.json'), 'utf8')); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
          if (report.status === 'completed' && isDeepStrictEqual(report.request, input)) return report;
        }
        throw new Error('Interrupted QA has no completed result; explicit review required');
      }
      if (kind === 'cuts') attempt.cut_input = input;
      await stage(kind === 'cuts' ? 'cutting' : 'analyzing');
      return qaOperation(root, generation.id, kind, input);
    };
    if (!analysis) {
      analysis = await qa('analyses', { clap: false });
      candidate = await preserve({ generation, analyses: [analysis], cut_failure: null, reason: 'Source and QA preserved before cut' }, source);
    }
    if (analysis.status !== 'completed') throw new Error(analysis.error ?? 'Analysis failed');
    const cut = async input => {
      const report = await qa('cuts', input);
      if (report.status !== 'completed') throw new Error(report.error ?? 'Cut failed');
      // Rebuild portable delivery paths after relocation without recomputing the cut.
      const audio = await readFile(join(directory, 'cuts', report.id, 'audio.wav'));
      const delivery = JSON.parse(execFileSync(process.execPath, [join(factoryRoot, 'bundle.mjs'), root, JSON.stringify(report)], { encoding: 'utf8', timeout: 10000 }));
      const evidence = JSON.parse(await readFile(delivery.metadata, 'utf8'));
      return preserve(evidence, source, audio);
    };
    if (!candidate.evidence.cut) {
      try { candidate = await cut(generation.request.loop ? { loop: true } : {}); }
      catch (error) {
        if (error.status !== 422) throw error;
        attempt.inflight = null; await save();
        return { id: generation.id, candidate_sha256: candidate.candidate_sha256, audio: join(root, '.runtime/studio/candidates', candidate.candidate_sha256, 'source.wav'), evaluation: null, outcome: 'signal_failed', reason_tags: ['silence'] };
      }
    }
    const staticFailure = candidate.evidence.cut.result?.static?.suspected === true;
    return { id: generation.id, audio: join(root, '.runtime/studio/candidates', candidate.candidate_sha256, 'audio.wav'), candidate_sha256: candidate.candidate_sha256,
      evaluation: null, outcome: staticFailure ? 'signal_failed' : 'needs_review', reason_tags: staticFailure ? ['suspected_static'] : [],
      qa: { regions: analysis.result?.regions, static: analysis.result?.static, silence: analysis.result?.silence },
      report: join(directory, 'analyses', analysis.id, 'report.json') };
  } finally {
    signal.removeEventListener('abort', cancel);
    operationSignal.removeEventListener('abort', abort);
    await factory.close();
    await backend.stop?.();
  }
}

export async function openJobs({ root = factoryRoot, token, execute = runWorkflow, ...execution } = {}) {
  if (typeof token !== "string" || !token) throw new Error("Private bearer token required");
  const directory = join(root, ".runtime/studio");
  const owners = join(directory, "owners");
  mkdirSync(owners, { recursive: true, mode: 0o700 });
  const owner = { pid: process.pid, identity: processIdentity(process.pid) };
  if (!owner.identity) throw new Error("Cannot establish workflow ownership");
  const lease = join(owners, `${randomUUID()}.json`);
  writeFileSync(lease, JSON.stringify(owner), { mode: 0o600, flag: "wx" });
  try {
    // Separate immutable claims avoid overwriting a newly acquired stale lock.
    for (const name of readdirSync(owners)) {
      const path = join(owners, name);
      if (path === lease) continue;
      let other;
      try { other = JSON.parse(readFileSync(path, "utf8")); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
      if (processIdentity(other.pid) === other.identity) throw new Error("Studio/workflow already owned by a live process");
    }
  } catch (error) { unlinkSync(lease); throw error; }
  let active;
  let cutting;
  let closing = false;
  const jobs = new Map();
  const soundId = job => {
    const seen = new Set();
    while (!job.sound_id && job.parent_id && jobs.has(job.parent_id) && !seen.has(job.id)) {
      seen.add(job.id); job = jobs.get(job.parent_id);
    }
    return job.sound_id ?? job.id;
  };
  let store;
  try { store = openReviewStore(directory); } catch (error) { unlinkSync(lease); throw error; }
  const jobsPath = join(directory, "jobs");
  let writes = Promise.resolve();
  const save = job => {
    const snapshot = structuredClone(job);
    writes = writes.then(() => atomicJson(join(jobsPath, `${job.id}.json`), snapshot));
    return writes;
  };
  try {
    await mkdir(jobsPath, { recursive: true });
    for (const name of readdirSync(jobsPath).filter(name => /^[a-f0-9]{32}\.json$/.test(name))) {
      const job = JSON.parse(readFileSync(join(jobsPath, name), "utf8"));
      if (name !== `${job.id}.json`) throw new Error("Job identity mismatch");
      for (const id of job.candidate_ids) store.loadCandidate(id);
      for (const result of [job.result, ...(job.attempts ?? []).map(a => a.result)]) {
        if (result?.audio && result.candidate_sha256) result.audio = join(directory, 'candidates', result.candidate_sha256, store.loadCandidate(result.candidate_sha256).evidence.cut ? 'audio.wav' : 'source.wav');
      }
      if (job.status === 'canceling') {
        job.status = 'canceled'; job.outcome = 'cancelled';
        job.error = 'Cancellation retained across restart; no operation was replayed.';
        await save(job);
      }
      if (job.status === "running") {
        job.status = "interrupted";
        job.error = "Outcome uncertain; inspect preserved evidence and explicitly resume. No generation was replayed.";
        await save(job);
      }
      jobs.set(job.id, job);
    }
  } catch (error) { unlinkSync(lease); throw error; }
  const start = async job => {
    if (job.version !== 2) throw Object.assign(new Error('Legacy jobs are read-only; start a new batch'), { status: 410 });
    if (closing) throw Object.assign(new Error("Studio stopping"), { status: 503 });
    if (active || cutting) throw Object.assign(new Error("Factory busy; retry the same key"), { status: 429 });
    const controller = new AbortController();
    const operation = { job, controller };
    active = operation;
    job.status = "running";
    delete job.finished_at; delete job.error;
    job.progress = "queued";
    job.attempts ??= [];
    if (job.provider !== 'youtube') {
      job.used_seeds ??= [];
      for (const a of job.attempts) if (!job.used_seeds.includes(a.seed)) job.used_seeds.push(a.seed);
    }
    const persisted = save(job);
    operation.promise = (async () => {
      try {
        await persisted;
        await execution.beforeCompute?.();
        controller.signal.throwIfAborted();
        if (job.provider === 'youtube') {
          job.variants ??= [{ index: 0, status: 'pending', attempt_ids: [hash(`${job.id}:import`).slice(0, 32)] }];
          job.attempts[0] ??= { id: job.variants[0].attempt_ids[0], variant_index: 0, number: 1, reason: 'Audio import' };
          job.attempt = 1;
          await save(job);
          job.result = await runYoutube(job, { root, token, store, save: () => save(job), signal: controller.signal, ...execution });
          job.attempts[0].result = job.result;
          job.variants[0].result = job.result; job.variants[0].status = 'completed';
        } else {
        if (!job.variants) {
          if (job.provider === 'local') {
            if (job.planning_started) throw new Error('Prompt planning interrupted; start an explicit new batch');
            job.planning_started = true; job.progress = 'planning'; await save(job);
            job.prompt_plan = await (execution.preparePrompts ?? preparePromptPlan)(job.input.request.prompt, { signal: controller.signal, loop: job.input.request.loop === true });
            if (job.prompt_plan.version !== 'prompt-plan-v2' || job.prompt_plan.generation_prompts?.length !== 5 || new Set(job.prompt_plan.generation_prompts).size !== 5)
              throw new Error('Planner must return five distinct prompts');
          }
          job.variants = (job.prompt_plan?.generation_prompts ?? [job.input.request.prompt]).map((prompt, index) => ({ index, prompt, status: 'pending', attempt_ids: [] }));
          await save(job);
        }
        for (const variant of job.variants) {
          if (['completed', 'exhausted'].includes(variant.status)) continue;
          while (true) {
            controller.signal.throwIfAborted();
            let attempt = job.attempts.find(a => a.variant_index === variant.index && !a.result);
            if (!attempt) {
              let seed = job.attempts.length === 0 ? job.input.request.seed : undefined;
              if (seed === undefined) do { seed = randomInt(2147483648); } while (job.used_seeds.includes(seed));
              const number = variant.attempt_ids.length + 1;
              attempt = { id: hash(`${job.id}:${variant.index}:${number}`).slice(0, 32), seed, variant_index: variant.index, number,
                reason: number === 1 ? 'Initial variant' : 'Deterministic signal replacement' };
              job.attempts.push(attempt); variant.attempt_ids.push(attempt.id); job.used_seeds.push(seed);
            }
            job.attempt = job.attempts.length; job.variant_index = variant.index; variant.status = 'running';
            await save(job);
            job.result = attempt.result ?? await execute(job, { root, token, store, save: () => save(job), signal: controller.signal, ...execution });
            attempt.result = job.result; variant.result = job.result;
            if (job.result.outcome === 'operational-error') throw new Error(job.result.error ?? 'Audio operation failed');
            const failed = job.result.outcome === 'signal_failed';
            variant.status = !failed ? 'completed' : job.provider === 'elevenlabs' || attempt.number >= 3 ? 'exhausted' : 'pending';
            await save(job);
            if (variant.status !== 'pending') break;
          }
        }
        }
        job.outcome = job.variants.some(v => v.status === 'exhausted') ? 'exhausted' : 'needs_review';
        job.status = 'completed';
      } catch (error) {
        job.status = closing && job.provider === "youtube" ? "interrupted" : controller.signal.aborted ? "canceled" : "failed";
        job.outcome = controller.signal.aborted ? 'cancelled' : 'operational-error';
        job.error = String(error);
      } finally {
        job.finished_at = new Date().toISOString();
        try { await save(job); } finally { active = undefined; }
      }
    })();
    operation.promise.catch(() => { closing = true; }); // Failed persistence poisons writes and prevents future cleanup.
    await persisted;
    return job;
  };
  let closed;
  const candidateSound = id => {
    const candidate = store.loadCandidate(id);
    const job = [...jobs.values()].find(j => j.candidate_ids.includes(id) || j.attempts?.some(a => a.id === candidate.attempt_id));
    return job ? soundId(job) : candidate.evidence.generation.id;
  };
  return {
    store,
    busy: () => Boolean(active || cutting),
    selectionHistory: id => store.selectionHistory(candidateSound(id)),
    selectTake(id, input) {
      const candidate = store.loadCandidate(id);
      if (candidate.evidence.generation.runtime.backend === 'youtube' && !candidate.evidence.cut)
        throw Object.assign(new Error('Finish import delivery before selecting this take'), { status: 409 });
      if (!input || Object.keys(input).sort().join() !== 'event_id,supersedes') throw Object.assign(new Error('Invalid selection'), { status: 400 });
      try { return store.selectTake({ ...input, sound_id: candidateSound(id), candidate_sha256: id }); }
      catch (error) { throw Object.assign(error, { status: /conflict|Stale/.test(error.message) ? 409 : 400 }); }
    },
    async recreate(id, key, input = {}) {
      if (!input || Object.keys(input).some(k => k !== "loop") || (input.loop !== undefined && typeof input.loop !== "boolean")) throw Object.assign(new Error("Expected optional boolean loop"), { status: 400 });
      const candidate = store.loadCandidate(id);
      const owner = [...jobs.values()].find(j => j.attempts?.some(a => a.id === candidate.attempt_id));
      const imported = candidate.evidence.generation.runtime.backend === 'youtube';
      const intent = imported ? owner?.input.request ?? candidate.evidence.generation.request : candidate.evidence.generation.request;
      const { prompt, duration_seconds } = intent;
      return this.submit(key, { provider: 'elevenlabs', request: { prompt, duration_seconds, loop: input.loop ?? (imported ? intent.loop ?? false : candidate.evidence.cut?.request?.loop ?? candidate.evidence.generation.request.loop ?? false) }, recreation_parent: id });
    },
    readiness: () => ({ generation: execution.fixture ? 'fixture' : existsSync(`${factoryRoot}/.runtime/sa3-gguf/build-manifest.json`) ? 'local' : 'setup_required',
      elevenlabs: (() => { try { elevenKey(); return 'configured'; } catch { return 'key_required'; } })() }),
    async setupQa() { throw Object.assign(new Error('Semantic QA was removed'), { status: 410 }); },
    async cut(id, input) {
      qaRequest('cuts', input);
      if (closing || active || cutting) throw Object.assign(new Error('Factory busy; wait for owned work to finish'), { status: 429 });
      const candidate = store.loadCandidate(id);
      const loop = input.loop ?? candidate.evidence.cut?.request?.loop ?? candidate.evidence.generation.request.loop;
      input = { ...input, ...(loop === undefined ? {} : { loop }) };
      cutting = (async () => {
        await execution.beforeCompute?.();
        await ensureSetup(false);
        const temporary = await mkdtemp(join(root, '.runtime/studio-cut-'));
        try {
          const run = candidate.evidence.generation;
          const directory = join(temporary, 'out/runs', run.id);
          await mkdir(directory, { recursive: true });
          await writeFile(join(directory, 'run.json'), JSON.stringify(run));
          await writeFile(join(directory, 'audio.wav'), store.readAsset(id, 'source'));
          for (const report of candidate.evidence.analyses) {
            await mkdir(join(directory, 'analyses', report.id), { recursive: true });
            await writeFile(join(directory, 'analyses', report.id, 'report.json'), JSON.stringify(report));
          }
          const cut = await qaOperation(temporary, run.id, 'cuts', input);
          if (cut.status !== 'completed') throw new Error(cut.error);
          const evidence = JSON.parse(await readFile(cut.delivery.metadata, 'utf8'));
          const source = store.readAsset(id, 'source'), audio = await readFile(cut.delivery.audio);
          const saved = store.saveCandidate({ attempt_id: candidate.attempt_id, fixture: candidate.fixture, evaluation: null, evidence }, source, audio);
          return saved;
        } finally { await rm(temporary, { recursive: true, force: true }); }
      })();
      try { return await cutting; } finally { cutting = undefined; }
    },
    async recover(id) {
      const job = jobs.get(id);
      if (!job || !(job.status === 'interrupted' || job.provider === 'youtube' && job.status === 'failed') || !job.attempts) throw Object.assign(new Error('No recoverable workflow checkpoint'), { status: 409 });
      return start(job);
    },
    async continue() { throw Object.assign(new Error('Legacy search budgets were removed; start a new batch'), { status: 410 }); },
    async acknowledge(id) {
      const job = jobs.get(id);
      if (!job || job.status !== 'interrupted') throw Object.assign(new Error('Only interrupted work requires acknowledgement'), { status: 409 });
      job.status = 'failed';
      job.error = `${job.error ?? 'Outcome uncertain.'} Acknowledged by user; preserved evidence remains available. Start a new request when ready.`;
      await save(job);
      return job;
    },
    async retry(id, key) { return this.resume(id, key); },
    list: () => [...jobs.values()], get: id => jobs.get(id),
    async submit(key, input, resuming) {
      if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(key)) throw Object.assign(new Error("Idempotency-Key required"), { status: 400 });
      // Resolve inheritance before canonicalizing false, and use an existing key's accepted intent on retry.
      workflowInput(input);
      const prior = jobs.get(hash(key).slice(0, 32));
      const parent = input.sound_parent_id ? jobs.get(input.sound_parent_id) : null;
      const latest = parent ? [...jobs.values()].filter(j => j.provider !== 'youtube' && soundId(j) === soundId(parent)).sort((a, b) => a.started_at.localeCompare(b.started_at)).at(-1) : null;
      const recreated = input.recreation_parent ? store.loadCandidate(input.recreation_parent) : null;
      const loop = input.request.loop ?? (prior ? prior.input.request.loop ?? false :
        recreated ? recreated.evidence.cut?.request?.loop ?? recreated.evidence.generation.request.loop ?? false : latest?.input.request.loop ?? false);
      input = input.provider === 'youtube' ? workflowInput(input) : workflowInput({ ...input, request: { ...input.request, ...(loop ? { loop: true } : { loop: false }) } });
      const id = hash(key).slice(0, 32);
      const signature = hash(JSON.stringify(input));
      const existing = jobs.get(id);
      if (existing) {
        if (existing.signature !== signature) throw Object.assign(new Error("Idempotency key conflict"), { status: 409 });
        return existing;
      }
      if ([...jobs.values()].some(job => job.status === "interrupted" && job.provider !== "youtube" && !jobs.has(job.resumed_by) && !jobs.has(hash(job.retry_key ?? "").slice(0,32)) &&
          !(job === resuming && (job.resumed_by === id || job.retry_key === key))))
        throw Object.assign(new Error("Interrupted outcome requires explicit resume before new generation"), { status: 409 });
      const soundParent = input.sound_parent_id ? jobs.get(input.sound_parent_id) : resuming;
      if (input.sound_parent_id && !soundParent) throw Object.assign(new Error("Unknown sound parent reference"), { status: 400 });
      const original = input.recreation_parent ? store.loadCandidate(input.recreation_parent) : null;
      const originalJob = original ? [...jobs.values()].find(j => j.candidate_ids.includes(input.recreation_parent) || j.attempts?.some(a => a.id === original.attempt_id)) : null;
      const sound_id = soundParent ? soundId(soundParent) : originalJob ? soundId(originalJob) : original ? original.evidence.generation.id : id;
      const usedSeeds = [...new Set([...jobs.values()].filter(job => soundId(job) === sound_id).flatMap(job => job.used_seeds ?? [job.input.request.seed]))];
      let seed = input.request.seed;
      if (input.provider !== 'youtube' && seed === undefined) do { seed = randomInt(2147483648); } while (usedSeeds.includes(seed));
      const job = { version: 2, id, signature, sound_id, provider: input.provider, input: input.provider === 'youtube' ? input : { ...input, request: { ...input.request, seed } },
        started_at: new Date().toISOString(), candidate_ids: [], ...(input.provider === 'youtube' ? {} : { used_seeds: [...new Set([...usedSeeds, ...(resuming?.used_seeds ?? [])])] }),
        ...(resuming ? { parent_id: resuming.id } : {}), attempt: 0 };
      // Reserve synchronously before the first persistence await.
      const started = start(job);
      if (active?.job === job) jobs.set(id, job);
      return started;
    },
    async resume(id, key) {
      const job = jobs.get(id);
      if (!job || !["interrupted", "canceled", "failed"].includes(job.status)) throw Object.assign(new Error("Job is not resumable"), { status: 409 });
      if (job.provider === 'youtube') return start(job);
      if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(key)) throw Object.assign(new Error("New Idempotency-Key required"), { status: 400 });
      const replacement = hash(key).slice(0, 32);
      if (replacement === id) throw Object.assign(new Error("Resume requires a new idempotency key"), { status: 400 });
      if (job.resumed_by && job.resumed_by !== replacement) throw Object.assign(new Error("Job already resumed; retry its original resume key"), { status: 409 });
      if (jobs.has(replacement) && job.resumed_by !== replacement) throw Object.assign(new Error("Resume idempotency key conflict"), { status: 409 });
      const nextInput = workflowInput(job.version === 2 ? job.input : { request: job.input.request, provider: 'local' });
      job.resumed_by = replacement;
      await save(job);
      return this.submit(key, nextInput, job); // Explicit new attempt; preserve the original uncertain outcome.
    },
    async cancel(id) {
      const job = jobs.get(id);
      if (!job) throw Object.assign(new Error("Unknown job"), { status: 404 });
      if (active?.job === job) {
        job.status = "canceling";
        const operation = active;
        await save(job);
        operation.controller.abort();
      }
      return job;
    },
    async wait() { await active?.promise; },
    close() {
      return closed ??= (async () => {
        closing = true;
        if (active) {
          const operation = active;
          operation.job.status = operation.job.provider === "youtube" ? "interrupted" : "canceling";
          try { await save(operation.job); } finally { operation.controller.abort(); }
          await operation.promise;
        }
        await cutting;
        await writes;
        unlinkSync(lease);
      })();
    },
  };
}
