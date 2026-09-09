import { randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MlxBackend } from "./dist/backend.js";
import { config, hash, root as factoryRoot, validateRequest } from "./dist/config.js";
import { processIdentity } from "./dist/ownership.js";
import { qaRequest, qaOperation } from "./dist/qa.js";
import { atomicJson, createFactory } from "./dist/service.js";
import { ensureSetup } from "./dist/setup.js";
import { judge } from './judge.mjs';
import { openReviewStore } from "./review-store.mjs";

export function workflowInput(input) {
  if (!input || Object.keys(input).some(key => !["request", "qa", "budget"].includes(key)) || !validateRequest(input.request))
    throw new Error(`Invalid workflow request: ${JSON.stringify(validateRequest.errors)}`);
  const request = { ...input.request, duration_seconds: input.request.duration_seconds ?? config.default_duration_seconds };
  const qa = input.qa ?? { clap: true, target: request.prompt.slice(0, 200), alternatives: ["Radio static noise", "A helicopter flying", "Silence"] };
  qaRequest("analyses", qa);
  const budget = input.budget;
  if (budget !== undefined && (!budget || Object.keys(budget).sort().join(',') !== 'attempts,minutes' ||
      !Number.isInteger(budget.attempts) || budget.attempts < 1 || budget.attempts > 10 ||
      !Number.isInteger(budget.minutes) || budget.minutes < 1 || budget.minutes > 60)) throw new Error('Invalid attempt/time budget');
  return { request, qa, ...(budget ? { budget } : {}) };
}

// The CLI and studio both use this single setup/generation/QA/cut/bundle workflow.
export async function runWorkflow(job, { root, token, store, save, signal, backend = new MlxBackend(), setup = ensureSetup, computePort = config.port, fixture = false }) {
  let ready = false;
  let budgetTimer;
  const factory = await createFactory({ root, token, backend, fresh: true, ready: () => ready });
  const abort = () => { void backend.stop?.(); };
  signal.addEventListener("abort", abort);
  const stage = async status => { job.progress = status; await save(); signal.throwIfAborted(); if (job.budget_exhausted) throw new Error("Time budget exhausted"); };
  try {
    // Acquire the compute port before setup or any temporary-output cleanup.
    await new Promise((resolve, reject) => { factory.server.once("error", reject); factory.server.listen(computePort, "127.0.0.1", resolve); });
    const url = `http://127.0.0.1:${factory.server.address().port}`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const call = async (path, value) => {
      const response = await fetch(`${url}${path}`, { method: value === undefined ? "GET" : "POST", headers: { ...headers, "Idempotency-Key": job.id },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }), signal: AbortSignal.timeout(config.timeout_ms + 30000) });
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      return response;
    };
    await stage("setup");
    await setup(job.input.qa.clap === true, signal);
    signal.throwIfAborted();
    if (job.input.budget) {
      job.budget_started_at ??= new Date().toISOString();
      await save();
      const remaining = job.input.budget.minutes * 60000 - (Date.now() - Date.parse(job.budget_started_at));
      if (remaining <= 0) { job.budget_exhausted = true; throw new Error('Time budget exhausted; start a new request to continue'); }
      budgetTimer = setTimeout(() => { job.budget_exhausted = true; abort(); }, remaining);
    }
    await backend.start?.();
    signal.throwIfAborted();
    const preserved = new Set(store.listCandidates().map(candidate => candidate.evidence.generation.id));
    // Recover completed sources left between generation and candidate publication, including legacy sessions.
    for (const runId of await readdir(join(root, "out/runs"))) {
      if (!/^[a-f0-9]{32}$/.test(runId)) continue;
      let generation;
      try { generation = JSON.parse(await readFile(join(root, "out/runs", runId, "run.json"), "utf8")); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      if (generation.status === "completed" && !preserved.has(runId)) store.saveCandidate({ attempt_id: runId, fixture, evaluation: null,
        evidence: { generation, analyses: [], cut_failure: null, reason: "Recovered source before temporary session cleanup" } },
        await readFile(join(root, "out/runs", runId, "audio.wav")));
    }
    await factory.beginSession();
    ready = true;
    await stage("generating");
    const response = await call("/v1/sound-effects", job.input.request);
    await response.arrayBuffer();
    const id = response.headers.get("x-run-id");
    const generation = await (await call(`/v1/runs/${id}`)).json();
    const source = await readFile(join(root, generation.audio_path));
    const preserve = async (evidence, audio = null, evaluation = null) => {
      const candidate = store.saveCandidate({ attempt_id: job.id, fixture, evidence, evaluation }, source, audio);
      if (!job.candidate_ids.includes(candidate.candidate_sha256)) job.candidate_ids.push(candidate.candidate_sha256);
      await save();
      return candidate.candidate_sha256;
    };
    // Preserve generated bytes even if cancellation or QA prevents a delivered cut.
    await preserve({ generation, analyses: [], cut_failure: null, reason: "Source preserved before QA" });
    await stage("analyzing");
    const analysis = await (await call(`/v1/runs/${id}/analyses`, job.input.qa)).json();
    await preserve({ generation, analyses: [analysis], cut_failure: null, reason: "Source and QA preserved before cut" });
    await stage("cutting");
    const cutResponse = await call(`/v1/runs/${id}/cuts`, {});
    await cutResponse.arrayBuffer();
    const location = cutResponse.headers.get("location");
    if (!location?.startsWith(`/v1/runs/${id}/cuts/`)) throw new Error("Invalid cut metadata location");
    const cut = await (await call(location)).json();
    const evidence = JSON.parse(await readFile(cut.delivery.metadata, "utf8"));
    let candidate = await preserve(evidence, await readFile(cut.delivery.audio));
    let evaluation = null;
    if (job.input.qa.clap) {
      await stage('evaluating');
      evaluation = await judge(cut.delivery.audio, job.input.request.prompt, { signal });
      candidate = await preserve(evidence, await readFile(cut.delivery.audio), evaluation);
    }
    return { id, audio: cut.delivery.audio, candidate_sha256: candidate, evaluation,
      qa: { regions: analysis.result?.regions, rhythmic_warning: analysis.result?.rhythm?.suspected,
        clap: { status: analysis.result?.clap?.status, error: analysis.result?.clap?.error, ranking: analysis.result?.clap?.scores?.[0]?.ranking } },
      report: `${root}/out/runs/${id}/analyses/${analysis.id}/report.json` };
  } finally {
    clearTimeout(budgetTimer);
    signal.removeEventListener("abort", abort);
    await factory.close(); // Accepted QA drains within its existing subprocess deadlines.
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
      if (["running", "canceling"].includes(job.status)) {
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
    job.progress = "queued";
    const persisted = save(job);
    operation.promise = (async () => {
      try {
        await persisted;
        controller.signal.throwIfAborted();
        job.result = await execute(job, { root, token, store, save: () => save(job), signal: controller.signal, ...execution });
        job.status = controller.signal.aborted ? "canceled" : "completed";
      } catch (error) {
        job.status = controller.signal.aborted ? "canceled" : "failed";
        job.error = String(error);
      } finally {
        if (job.budget_exhausted) { job.status = "exhausted"; job.error = "Time budget exhausted. Start a new request to continue."; }
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
      existsSync(`${factoryRoot}/.runtime/mlx-venv/bin/python`) && config.models.every(m => existsSync(`${factoryRoot}/.runtime/official-sa3/optimized/mlx/models/mlx/${m.file}`)) ? 'installed' : 'setup_required', judge: qaSetup }),
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
          const evaluation = candidate.evaluation ? await judge(cut.delivery.audio, run.request.prompt) : null;
          return store.saveCandidate({ attempt_id: candidate.attempt_id, fixture: candidate.fixture, evaluation,
            evidence: JSON.parse(await readFile(cut.delivery.metadata, 'utf8')) }, store.readAsset(id, 'source'), await readFile(cut.delivery.audio));
        } finally { await rm(temporary, { recursive: true, force: true }); }
      })();
      try { return await cutting; } finally { cutting = undefined; }
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
      const request = { ...job.input.request }; delete request.seed;
      return this.submit(key, { ...job.input, request }, job);
    },
    list: () => [...jobs.values()], get: id => jobs.get(id),
    async submit(key, input, resuming) {
      if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(key)) throw Object.assign(new Error("Idempotency-Key required"), { status: 400 });
      input = workflowInput(input);
      const id = hash(key).slice(0, 32);
      const signature = hash(JSON.stringify({ request: { prompt: input.request.prompt, duration_seconds: input.request.duration_seconds, seed: input.request.seed }, qa: Object.fromEntries(Object.entries(input.qa).sort()), ...(input.budget ? { budget: input.budget } : {}) }));
      const existing = jobs.get(id);
      if (existing) {
        if (existing.signature !== signature) throw Object.assign(new Error("Idempotency key conflict"), { status: 409 });
        return existing;
      }
      if ([...jobs.values()].some(job => job.status === "interrupted" && !jobs.has(job.resumed_by) && !jobs.has(hash(job.retry_key ?? "").slice(0,32)) &&
          !(job === resuming && (job.resumed_by === id || job.retry_key === key))))
        throw Object.assign(new Error("Interrupted outcome requires explicit resume before new generation"), { status: 409 });
      const job = { id, signature, input: { ...input, request: { ...input.request, seed: input.request.seed ?? randomInt(2147483648) } },
        started_at: new Date().toISOString(), candidate_ids: [],
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
