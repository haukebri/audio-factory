import { execFileSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { GgufBackend } from "./dist/backend.js";
import { config, hash, root as factoryRoot, validateRequest } from "./dist/config.js";
import { processIdentity } from "./dist/ownership.js";
import { qaRequest, qaOperation } from "./dist/qa.js";
import { atomicJson, createFactory } from "./dist/service.js";
import { ensureSetup } from "./dist/setup.js";
import { judge } from './judge.mjs';
import { preparePromptPlan, fallbackPlan } from './prompt-plan.mjs';
import { selectedPolicy } from './evaluation.mjs';
import { openReviewStore } from "./review-store.mjs";

export function workflowInput(input) {
  if (!input || Object.keys(input).some(key => !["request", "qa", "budget", "mode", "sound_parent_id"].includes(key)) || !validateRequest(input.request))
    throw new Error(`Invalid workflow request: ${JSON.stringify(validateRequest.errors)}`);
  if (input.sound_parent_id !== undefined && (typeof input.sound_parent_id !== "string" || !/^[a-f0-9]{32}$/.test(input.sound_parent_id))) throw new Error("Invalid sound parent reference");
  const request = { ...input.request, duration_seconds: input.request.duration_seconds ?? config.default_duration_seconds };
  const qa = input.qa ?? { clap: true, target: request.prompt.slice(0, 200), alternatives: ["Radio static noise", "A helicopter flying", "Silence"] };
  qaRequest("analyses", qa);
  if (input.mode !== undefined && !['manual', 'automatic'].includes(input.mode)) throw new Error('Invalid review mode');
  const budget = input.budget ?? (input.mode === 'automatic' ? { attempts: 3, minutes: 20 } : undefined);
  if (budget !== undefined && (!budget || Object.keys(budget).sort().join(',') !== 'attempts,minutes' ||
      !Number.isInteger(budget.attempts) || budget.attempts < 1 || budget.attempts > 10 ||
      !Number.isInteger(budget.minutes) || budget.minutes < 1 || budget.minutes > 60)) throw new Error('Invalid attempt/time budget');
  return { request, qa, ...(input.sound_parent_id ? { sound_parent_id: input.sound_parent_id } : {}), ...(input.mode ? { mode: input.mode } : {}), ...(budget ? { budget } : {}) };
}

// The CLI and studio both use this single setup/generation/QA/cut/bundle workflow.
export async function runWorkflow(job, { root, token, store, save, signal, backend = new GgufBackend(), setup = ensureSetup, computePort = config.port, fixture = false, evaluate = judge }) {
  const attempt = job.attempts?.at(-1) ?? (job.checkpoint ??= { id: job.id, seed: job.input.request.seed });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel);
  if (signal.aborted) cancel();
  const operationSignal = controller.signal;
  const abort = () => { void backend.stop?.(); };
  operationSignal.addEventListener('abort', abort);
  let timer, ready = false;
  const factory = await createFactory({ root, token, backend, fresh: true, ready: () => ready, computeBusy: () => job.progress !== 'generating' });
  const checkBudget = () => {
    if (job.budget_started_at && Date.now() - Date.parse(job.budget_started_at) >= job.input.budget.minutes * 60000) {
      job.budget_exhausted = true; controller.abort();
    }
    operationSignal.throwIfAborted();
  };
  const stage = async status => {
    checkBudget();
    if (factory.busy()) throw new Error('Another accepted compute operation must finish before workflow recovery');
    job.progress = status; attempt.inflight = status; await save();
    operationSignal.throwIfAborted();
  };
  const preserve = async (evidence, source, audio = null, evaluation = null) => {
    if (job.prompt_plan) evidence = { ...evidence, generation: { ...evidence.generation, prompt_plan: job.prompt_plan } };
    const candidate = store.saveCandidate({ attempt_id: attempt.id, fixture, evidence, evaluation }, source, audio);
    if (!job.candidate_ids.includes(candidate.candidate_sha256)) job.candidate_ids.push(candidate.candidate_sha256);
    attempt.candidate_id = candidate.candidate_sha256;
    attempt.inflight = null;
    await save();
    return candidate;
  };
  try {
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
      // Automatic mode never downloads a missing judge in response to a rejected sound.
      await stage('setup');
      if (!job.budget_started_at) await setup(job.input.mode !== 'automatic' && job.input.qa.clap === true, operationSignal);
      attempt.inflight = null;
    }
    if (job.input.budget) {
      job.budget_started_at ??= new Date().toISOString();
      await save();
      const remaining = job.input.budget.minutes * 60000 - (Date.now() - Date.parse(job.budget_started_at));
      if (remaining <= 0) { job.budget_exhausted = true; throw new Error('Time budget exhausted'); }
      timer = setTimeout(() => { job.budget_exhausted = true; controller.abort(); }, remaining);
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
        body: JSON.stringify({ ...job.input.request, prompt: job.prompt_plan?.generation_prompts[(job.attempt - 1) % job.prompt_plan.generation_prompts.length] ?? job.input.request.prompt, seed: attempt.seed }), signal: AbortSignal.timeout(config.timeout_ms + 30000),
      });
      await response.arrayBuffer();
      if (!response.ok) throw new Error(`Generation failed: ${response.status}`);
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
      analysis = await qa('analyses', job.input.mode === 'automatic' ? { clap: false } : { ...job.input.qa, ...(job.input.qa.clap && job.prompt_plan ? { target: job.prompt_plan.qa_target } : {}) });
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
      try { candidate = await cut({}); }
      catch (error) {
        if (error.status !== 422) throw error;
        attempt.inflight = null; await save();
        return { id: generation.id, candidate_sha256: candidate.candidate_sha256, evaluation: null, outcome: 'rejected', reason_tags: ['no_active_region'] };
      }
    }
    const score = async c => {
      if (c.evaluation || !job.input.qa.clap) return c;
      if (attempt.inflight) throw new Error('Interrupted judge has no saved verdict; explicit review required');
      await stage('evaluating');
      const audio = store.readAsset(c.candidate_sha256, 'audio');
      const path = join(directory, 'judge-input.wav');
      await writeFile(path, audio);
      const evaluation = await evaluate(path, job.prompt_plan?.qa_target ?? job.input.request.prompt, { signal: operationSignal, ...(job.evaluation_policy ? { policy: job.evaluation_policy.judge } : {}) });
      return preserve(c.evidence, source, audio, evaluation);
    };
    candidate = await score(candidate);
    checkBudget();
    if (job.evaluation_policy?.selection.region !== 'first' && !attempt.alternate && candidate.evaluation?.reason_tags.some(tag => ['active_boundary', 'silence', 'bad_trim'].includes(tag))) {
      const bounds = candidate.evidence.cut.bounds;
      const region = analysis.result?.regions?.find(r => Math.round(r.start_seconds * bounds.sample_rate) !== bounds.start_sample || Math.round(r.end_seconds * bounds.sample_rate) !== bounds.end_sample);
      const input = region ? { start_seconds: region.start_seconds, end_seconds: region.end_seconds } : {
        start_seconds: Math.max(0, bounds.start_sample / bounds.sample_rate - 0.1),
        end_seconds: Math.min(generation.audio.seconds, bounds.end_sample / bounds.sample_rate + 0.1),
      };
      attempt.alternate = input; await save();
    }
    if (attempt.alternate && !attempt.alternate_done) {
      if (!isDeepStrictEqual(candidate.evidence.cut.request, attempt.alternate)) candidate = await cut(attempt.alternate);
      candidate = await score(candidate);
      attempt.alternate_done = true; await save();
    }
    checkBudget();
    const evaluation = candidate.evaluation;
    return { id: generation.id, audio: join(root, '.runtime/studio/candidates', candidate.candidate_sha256, 'audio.wav'), candidate_sha256: candidate.candidate_sha256, evaluation,
      outcome: evaluation?.evidence?.error && !/ENOENT|missing|not installed/i.test(evaluation.evidence.error) ? 'operational-error' : evaluation?.verdict ?? 'needs_review',
      reason_tags: evaluation?.reason_tags ?? ['judge_disabled'],
      qa: { regions: analysis.result?.regions, rhythmic_warning: analysis.result?.rhythm?.suspected,
        clap: { status: analysis.result?.clap?.status, error: analysis.result?.clap?.error, ranking: analysis.result?.clap?.scores?.[0]?.ranking } },
      report: join(directory, 'analyses', analysis.id, 'report.json') };
  } finally {
    clearTimeout(timer);
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
  let preparing;
  let qaSetup = { status: "idle" };
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
        if (result?.audio && result.candidate_sha256) result.audio = join(directory, 'candidates', result.candidate_sha256, 'audio.wav');
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
    if (closing) throw Object.assign(new Error("Studio stopping"), { status: 503 });
    if (active || cutting || preparing) throw Object.assign(new Error("Factory busy; retry the same key"), { status: 429 });
    const controller = new AbortController();
    const operation = { job, controller };
    active = operation;
    job.status = "running";
    delete job.finished_at; delete job.error;
    job.progress = "queued";
    job.attempts ??= [{ id: job.id, seed: job.input.request.seed, reason: job.parent_id ? 'Explicit human retry / continuation' : 'Initial request' }];
    job.used_seeds ??= [];
    for (const a of job.attempts) if (!job.used_seeds.includes(a.seed)) job.used_seeds.push(a.seed);
    const persisted = save(job);
    operation.promise = (async () => {
      try {
        await persisted;
        controller.signal.throwIfAborted();
        if (job.prompt_plan_pending) {
          job.progress = 'planning';
          // Persist the safe continuation first: recovery never repeats an uncertain LLM call.
          job.prompt_plan_pending = false;
          job.prompt_plan = fallbackPlan(job.input.request.prompt, 'Prompt preparation interrupted; using original prompt');
          await save(job);
          job.prompt_plan = await (execution.preparePrompts ?? preparePromptPlan)(job.input.request.prompt, { signal: controller.signal });
          controller.signal.throwIfAborted();
          await save(job);
        }
        while (true) {
          const attempt = job.attempts.at(-1);
          job.result = attempt.result ?? await execute(job, { root, token, store, save: () => save(job), signal: controller.signal, ...execution });
          attempt.result = job.result;
          job.outcome = job.result.outcome ?? job.result.evaluation?.verdict ?? 'needs_review';
          await save(job);
          controller.signal.throwIfAborted();
          if (job.input.mode !== 'automatic' || job.outcome !== 'rejected') break;
          if (job.attempt >= job.input.budget.attempts || Date.now() - Date.parse(job.budget_started_at) >= job.input.budget.minutes * 60000) {
            job.outcome = 'exhausted'; break;
          }
          job.attempt++;
          let seed;
          do { seed = randomInt(2147483648); } while (job.used_seeds.includes(seed));
          job.used_seeds.push(seed);
          job.attempts.push({ id: hash(`${job.id}:${job.attempt}`).slice(0,32), seed,
            reason: job.result.reason_tags?.join(', ') || 'Automatic rejection', previous_candidate_id: job.result.candidate_sha256 });
          job.progress = 'retry_pending';
          await save(job); // Persist the new seed and reason before any new cleanup or generation.
        }
        job.status = job.outcome === 'operational-error' ? 'failed' : job.outcome === 'exhausted' ? 'exhausted' : 'completed';
      } catch (error) {
        job.status = controller.signal.aborted ? "canceled" : "failed";
        job.outcome = controller.signal.aborted ? 'cancelled' : 'operational-error';
        job.error = String(error);
      } finally {
        if (job.budget_exhausted && !controller.signal.aborted) { job.status = "exhausted"; job.outcome = 'exhausted'; job.error = "Time budget exhausted. Explicit additional budget is required to continue."; }
        job.finished_at = new Date().toISOString();
        try { await save(job); } finally { active = undefined; }
      }
    })();
    operation.promise.catch(() => { closing = true; }); // Failed persistence poisons writes and prevents future cleanup.
    await persisted;
    return job;
  };
  let closed;
  return {
    store,
    readiness: () => ({ generation: execution.fixture ? 'fixture' :
      existsSync(`${factoryRoot}/.runtime/sa3-gguf/build-manifest.json`) && config.models.every(m => existsSync(`${factoryRoot}/.runtime/sa3-gguf/models/${m.file}`)) ? 'installed' : 'setup_required', judge: qaSetup }),
    async setupQa(cancel = false) {
      if (cancel) { preparing?.controller.abort(); return qaSetup; }
      if (preparing) return qaSetup;
      if (closing || active || cutting) throw Object.assign(new Error('Factory busy'), { status: 429 });
      const controller = new AbortController();
      qaSetup = { status: 'running', progress: 'Verifying dependencies and cached hashes; downloading missing files. Allow up to 45 minutes. Progress: .runtime/setup.log' };
      preparing = { controller };
      preparing.promise = ensureSetup(true, controller.signal, true).then(() => { qaSetup = { status: 'ready', progress: 'Selected CLAP runtime and hashes verified. Quality remains experimental.' }; }, error => { qaSetup = { status: controller.signal.aborted ? 'canceled' : 'failed', error: String(error) }; }).finally(() => { preparing = undefined; });
      return qaSetup;
    },
    async cut(id, input) {
      qaRequest('cuts', input);
      if (closing || active || cutting || preparing) throw Object.assign(new Error('Factory busy; wait for owned work to finish'), { status: 429 });
      const candidate = store.loadCandidate(id);
      cutting = (async () => {
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
          if (!candidate.evaluation) return saved;
          const selected = selectedPolicy(root);
          const evaluation = await (execution.evaluate ?? judge)(cut.delivery.audio, run.prompt_plan?.qa_target ?? run.request.prompt, selected ? { policy: selected.judge } : {});
          return store.saveCandidate({ attempt_id: candidate.attempt_id, fixture: candidate.fixture, evaluation, evidence }, source, audio);
        } finally { await rm(temporary, { recursive: true, force: true }); }
      })();
      try { return await cutting; } finally { cutting = undefined; }
    },
    async recover(id) {
      const job = jobs.get(id);
      if (!job || job.status !== 'interrupted' || !job.attempts) throw Object.assign(new Error('No recoverable workflow checkpoint'), { status: 409 });
      return start(job);
    },
    async continue(id, key, budget) {
      const job = jobs.get(id);
      if (!job || ['running', 'canceling', 'interrupted'].includes(job.status)) throw Object.assign(new Error('Finish or acknowledge the previous request first'), { status: 409 });
      const input = workflowInput({ ...job.input, budget });
      if (!budget) throw Object.assign(new Error('Explicit additional budget required'), { status: 400 });
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(key)) throw Object.assign(new Error('New continuation key required'), { status: 400 });
      const existing = jobs.get(hash(key).slice(0,32));
      if (job.continuation?.key === key && JSON.stringify(job.continuation.budget) === JSON.stringify(budget) && existing) return existing;
      if (existing || job.continuation && (job.continuation.key !== key || JSON.stringify(job.continuation.budget) !== JSON.stringify(budget))) throw Object.assign(new Error('Continuation conflict'), { status: 409 });
      if (closing || active || cutting || preparing) throw Object.assign(new Error('Factory busy'), { status: 429 });
      let seed = job.continuation?.seed;
      if (seed === undefined) do { seed = randomInt(2147483648); } while (job.used_seeds.includes(seed));
      job.continuation ??= { key, budget, seed, recorded_at: new Date().toISOString(), reason: 'Explicit additional human budget' };
      await save(job);
      return this.submit(key, { ...input, request: { ...input.request, seed } }, { id: job.id, attempt: 0, used_seeds: job.used_seeds });
    },
    async acknowledge(id) {
      const job = jobs.get(id);
      if (!job || job.status !== 'interrupted') throw Object.assign(new Error('Only interrupted work requires acknowledgement'), { status: 409 });
      job.status = 'failed';
      job.error = `${job.error ?? 'Outcome uncertain.'} Acknowledged by user; preserved evidence remains available. Start a new request when ready.`;
      await save(job);
      return job;
    },
    async retry(id, key) {
      const job = jobs.get(id);
      if (!job || ['running', 'canceling'].includes(job.status)) throw Object.assign(new Error('Wait for this request to finish'), { status: 409 });
      if (job.retry_key && job.retry_key !== key) throw Object.assign(new Error('Retry already created; select the latest request'), { status: 409 });
      if (job.retry_key === key && jobs.has(hash(key).slice(0,32))) return jobs.get(hash(key).slice(0,32));
      if ((job.attempt ?? 1) >= (job.input.budget?.attempts ?? 1) || job.budget_exhausted ||
          job.budget_started_at && Date.now() - Date.parse(job.budget_started_at) >= job.input.budget.minutes * 60000)
        throw Object.assign(new Error('Budget exhausted; start a new request to continue'), { status: 409 });
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(key) || jobs.has(hash(key).slice(0,32))) throw Object.assign(new Error('New retry key required'), { status: 400 });
      if (active || cutting || preparing) throw Object.assign(new Error('Factory busy'), { status: 429 });
      job.retry_key = key;
      await save(job);
      const request = { ...job.input.request };
      do { request.seed = randomInt(2147483648); } while (job.used_seeds?.includes(request.seed));
      return this.submit(key, { ...job.input, request }, job);
    },
    list: () => [...jobs.values()], get: id => jobs.get(id),
    async submit(key, input, resuming) {
      if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(key)) throw Object.assign(new Error("Idempotency-Key required"), { status: 400 });
      input = workflowInput(input);
      const id = hash(key).slice(0, 32);
      const signature = hash(JSON.stringify({ request: { prompt: input.request.prompt, duration_seconds: input.request.duration_seconds, seed: input.request.seed }, qa: Object.fromEntries(Object.entries(input.qa).sort()), ...(input.budget ? { budget: input.budget } : {}), ...(input.mode ? { mode: input.mode } : {}), ...(input.sound_parent_id ? { sound_parent_id: input.sound_parent_id } : {}) }));
      const existing = jobs.get(id);
      if (existing) {
        if (existing.signature !== signature) throw Object.assign(new Error("Idempotency key conflict"), { status: 409 });
        return existing;
      }
      if ([...jobs.values()].some(job => job.status === "interrupted" && !jobs.has(job.resumed_by) && !jobs.has(hash(job.retry_key ?? "").slice(0,32)) &&
          !(job === resuming && (job.resumed_by === id || job.retry_key === key))))
        throw Object.assign(new Error("Interrupted outcome requires explicit resume before new generation"), { status: 409 });
      const soundParent = input.sound_parent_id ? jobs.get(input.sound_parent_id) : resuming;
      if (input.sound_parent_id && !soundParent) throw Object.assign(new Error("Unknown sound parent reference"), { status: 400 });
      const sound_id = soundParent ? soundId(soundParent) : id;
      const usedSeeds = [...new Set([...jobs.values()].filter(job => soundId(job) === sound_id).flatMap(job => job.used_seeds ?? [job.input.request.seed]))];
      let seed = input.request.seed;
      if (seed === undefined) do { seed = randomInt(2147483648); } while (usedSeeds.includes(seed));
      const evaluation_policy = selectedPolicy(root);
      if (evaluation_policy && input.mode === 'automatic') input = { ...input, budget: {
        attempts: Math.min(input.budget.attempts, evaluation_policy.selection.attempts),
        minutes: Math.min(input.budget.minutes, evaluation_policy.selection.milliseconds / 60000),
      } };
      const job = { id, signature, sound_id, ...(evaluation_policy ? { evaluation_policy } : {}), input: { ...input, request: { ...input.request, seed } },
        ...(resuming?.prompt_plan ? { prompt_plan: resuming.prompt_plan } : { prompt_plan_pending: execute === runWorkflow && !execution.fixture || !!execution.preparePrompts }),
        started_at: new Date().toISOString(), candidate_ids: [],
        used_seeds: [...new Set([...usedSeeds, ...(resuming?.used_seeds ?? [])])],
        ...(resuming ? { attempt: (resuming.attempt ?? 1) + 1, budget_started_at: resuming.budget_started_at, parent_id: resuming.id } : { attempt: 1 }) };
      // Reserve synchronously before the first persistence await.
      const started = start(job);
      if (active?.job === job) jobs.set(id, job);
      return started;
    },
    async resume(id, key) {
      const job = jobs.get(id);
      if (job?.input.budget) return this.retry(id, key);
      if (!job || !["interrupted", "canceled", "failed"].includes(job.status)) throw Object.assign(new Error("Job is not resumable"), { status: 409 });
      if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(key)) throw Object.assign(new Error("New Idempotency-Key required"), { status: 400 });
      const replacement = hash(key).slice(0, 32);
      if (replacement === id) throw Object.assign(new Error("Resume requires a new idempotency key"), { status: 400 });
      if (job.resumed_by && job.resumed_by !== replacement) throw Object.assign(new Error("Job already resumed; retry its original resume key"), { status: 409 });
      if (jobs.has(replacement) && job.resumed_by !== replacement) throw Object.assign(new Error("Resume idempotency key conflict"), { status: 409 });
      job.resumed_by = replacement;
      await save(job);
      return this.submit(key, job.input, job); // Explicit new attempt; preserve the original uncertain outcome.
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
          operation.job.status = "canceling";
          try { await save(operation.job); } finally { operation.controller.abort(); }
          await operation.promise;
        }
        preparing?.controller.abort();
        await preparing?.promise;
        await cutting;
        await writes;
        unlinkSync(lease);
      })();
    },
  };
}
