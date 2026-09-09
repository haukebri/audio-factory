import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { openReviewStore } from './review-store.mjs';
import { decide, policy, policyHash, validatePolicy } from './judge.mjs';

const json = path => JSON.parse(readFileSync(path, 'utf8'));
const serialize = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : serialize(value)).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const model = json(new URL('./qa-model.lock.json', import.meta.url));
const baseline = json(new URL('./docs/tasks/m02/clap-m1-baseline.lock.json', import.meta.url));
export const defaultPolicy = { version: 'evaluation-v1-experimental', judge: policy,
  selection: { attempts: 3, milliseconds: 1200000, region: 'recorded-alternate' } };
const implementation = Object.fromEntries(['evaluation.mjs', 'judge.mjs', 'review-store.mjs'].map(name => [name, digest(readFileSync(new URL(name, import.meta.url)))]));
const targets = { clips: 100, approved: 50, rejected: 50, families: 10,
  false_accept_reduction: 0.5, precision: 0.9, false_reject_rate: 0.2, selection_approval_increase: 0.2 };
const audioHash = c => c.evidence.cut?.audio_sha256 ?? c.evidence.generation.audio_sha256;
const prompt = c => c.evidence.generation.request.prompt;
const normalized = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function validateComparison(p) {
  assert(p && Object.keys(p).sort().join() === 'judge,selection,version' && typeof p.version === 'string' && p.version.length > 0, 'Invalid comparison policy');
  validatePolicy(p.judge);
  assert(p.selection && Object.keys(p.selection).sort().join() === 'attempts,milliseconds,region' &&
    Number.isInteger(p.selection.attempts) && p.selection.attempts >= 1 && p.selection.attempts <= 10 &&
    Number.isInteger(p.selection.milliseconds) && p.selection.milliseconds >= 60000 && p.selection.milliseconds <= 3600000 && p.selection.milliseconds % 60000 === 0 &&
    ['first', 'recorded-alternate'].includes(p.selection.region), 'Invalid selection policy');
  return p;
}

// Connected components make duplicate audio a transitive constraint, even across prompt families.
export function partition(rows, families = {}, jobs = []) {
  assert(families && !Array.isArray(families) && typeof families === 'object' && Object.values(families).every(v => typeof v === 'string' && v.trim()), 'Invalid family map');
  const parents = rows.map((_, i) => i), seen = new Map();
  const find = i => parents[i] === i ? i : (parents[i] = find(parents[i]));
  const connect = (key, i) => { if (seen.has(key)) parents[find(i)] = find(seen.get(key)); else seen.set(key, i); };
  const byId = new Map(rows.map((r, i) => [r.candidate.candidate_sha256, i]));
  rows.forEach(({ candidate: c }, i) => {
    connect('prompt:' + normalized(prompt(c)), i);
    connect('family:' + (families[prompt(c)] ?? normalized(prompt(c))), i);
    connect('audio:' + audioHash(c), i);
    connect('audio:' + c.evidence.generation.audio_sha256, i);
    connect('attempt:' + c.attempt_id, i);
  });
  for (const job of jobs) for (const id of job.candidate_ids ?? []) if (byId.has(id)) connect('job:' + (job.parent_id ?? job.id), byId.get(id));
  // Also join a continuation's parent when that parent itself has a parent.
  for (const job of jobs) {
    const parent = jobs.find(j => j.id === job.parent_id);
    if (parent) for (const id of [...(parent.candidate_ids ?? []), ...(job.candidate_ids ?? [])]) if (byId.has(id)) connect('job:' + job.id, byId.get(id));
  }
  const components = new Map();
  rows.forEach((r, i) => { const key = find(i); components.set(key, [...(components.get(key) ?? []), r.candidate.candidate_sha256]); });
  return rows.map((r, i) => {
    const group = digest(components.get(find(i)).sort());
    return { candidate_sha256: r.candidate.candidate_sha256, group,
      family: families[prompt(r.candidate)] ?? normalized(prompt(r.candidate)),
      split: parseInt(group.slice(0, 8), 16) % 5 === 0 ? 'holdout' : 'development' };
  });
}

export function collect(store) {
  return store.listCandidates().map(candidate => ({ candidate, history: store.history(candidate.candidate_sha256) }));
}
function examples(rows, assignments, synthetic) {
  const groups = new Map();
  for (const row of rows.filter(r => r.candidate.fixture === synthetic)) {
    const key = audioHash(row.candidate);
    const group = groups.get(key) ?? [];
    group.push(row); groups.set(key, group);
  }
  return [...groups.entries()].map(([audio_sha256, members]) => {
    const labels = members.map(r => r.history.at(-1)).filter(Boolean);
    const disagreement = new Set(labels.map(l => l.verdict)).size > 1 || new Set(members.map(r => normalized(prompt(r.candidate)))).size > 1;
    const assignment = assignments.find(a => a.candidate_sha256 === members[0].candidate.candidate_sha256);
    return { audio_sha256, members, ...assignment, disagreement,
      human: !disagreement && labels.length ? labels[0].verdict : null };
  });
}
export function coverage(rows, assignments = partition(rows)) {
  const real = examples(rows, assignments, false), labelled = real.filter(r => r.human);
  const approved = labelled.filter(r => r.human === 'accepted').length;
  const rejected = labelled.length - approved;
  const families = new Set(labelled.map(r => r.family)).size;
  return { status: 'quality_not_established', candidates: rows.length, real_unique_audio: real.length,
    synthetic_candidates: rows.filter(r => r.candidate.fixture).length,
    human_labelled: labelled.length, approved, rejected, families,
    disagreements: real.filter(r => r.disagreement).length,
    unreviewed: real.filter(r => !r.human && !r.disagreement).length,
    human_auto_disagreements: labelled.filter(r => r.members.some(m => m.candidate.evaluation &&
      ['auto_accepted', 'rejected'].includes(m.candidate.evaluation.verdict) &&
      (m.candidate.evaluation.verdict === 'auto_accepted') !== (r.human === 'accepted'))).length,
    corrections: rows.reduce((n, r) => n + Math.max(0, r.history.length - 1), 0),
    missing: { clips: Math.max(0, targets.clips - labelled.length), approved: Math.max(0, targets.approved - approved),
      rejected: Math.max(0, targets.rejected - rejected), families: Math.max(0, targets.families - families) },
    partitions: Object.fromEntries(['development', 'holdout'].map(split => [split, { audio: real.filter(r => r.split === split).length,
      labelled: labelled.filter(r => r.split === split).length }])),
    unreviewed_candidates: real.filter(r => !r.human).map(r => r.candidate_sha256) };
}
function seal(value) { return { ...value, sha256: digest(value) }; }
function verifySeal(value) { const { sha256, ...body } = value; assert(sha256 === digest(body), 'Manifest hash mismatch'); return body; }
export function exportDataset(store, jobs = [], families = {}) {
  const rows = collect(store), assets = {};
  for (const { candidate: c } of rows) for (const kind of ['source', ...(c.evidence.cut ? ['audio'] : [])]) {
    const bytes = store.readAsset(c.candidate_sha256, kind); assets[digest(bytes)] = bytes.toString('base64');
  }
  return seal({ schema: 'audio-factory-evaluation@1', rows, assets, jobs, families,
    assignments: partition(rows, families, jobs), targets, implementation, models: { baseline, larger: model },
    policies: [defaultPolicy], split_rule: 'connected-components-sha256-mod5-v1',
    baseline_rule: 'M1 was advisory. Evaluation proxy: pinned M1 target ranks first in every window, silence < 0.98, clipping < 0.001. Not a historical automatic verdict.',
    workload: { generations: 0, model_inferences: 0, mode: 'cached-only' } });
}
// Import into a new local review store, never over a live store. Validation reuses its lineage/schema checks.
export function importDataset(dataset, destination) {
  verifySeal(dataset);
  assert(dataset.schema === 'audio-factory-evaluation@1' && Array.isArray(dataset.rows) && Array.isArray(dataset.jobs), 'Unsupported dataset');
  assert(isDeepStrictEqual(dataset.targets, targets) && isDeepStrictEqual(dataset.models, { baseline, larger: model }) &&
    isDeepStrictEqual(dataset.assignments, partition(dataset.rows, dataset.families, dataset.jobs)), 'Benchmark definition mismatch');
  assert(!existsSync(destination), 'Import destination must be new');
  mkdirSync(resolve(destination, '..'), { recursive: true });
  const staging = mkdtempSync(resolve(destination, '..', '.evaluation-import-'));
  try {
    const store = openReviewStore(staging), ids = new Set();
    for (const { candidate, history } of dataset.rows) {
      const { candidate_sha256, ...record } = candidate;
      assert(!ids.has(candidate_sha256), 'Duplicate candidate'); ids.add(candidate_sha256);
      const asset = id => {
        assert(typeof dataset.assets[id] === 'string', 'Missing asset');
        const bytes = Buffer.from(dataset.assets[id], 'base64'); assert(digest(bytes) === id, 'Asset hash mismatch'); return bytes;
      };
      const saved = store.saveCandidate(record, asset(candidate.evidence.generation.audio_sha256), candidate.evidence.cut ? asset(audioHash(candidate)) : null);
      assert(saved.candidate_sha256 === candidate_sha256, 'Candidate hash mismatch');
      store.importHistory(candidate_sha256, history);
    }
    writeFileSync(join(staging, 'dataset.json'), serialize(dataset), { mode: 0o600, flag: 'wx' });
    renameSync(staging, destination);
  } finally { rmSync(staging, { recursive: true, force: true }); }
  return openReviewStore(destination);
}

export function rate(numerator, denominator) {
  if (!denominator) return { numerator, denominator, value: null, wilson95: null };
  const p = numerator / denominator, z2 = 1.96 ** 2, d = 1 + z2 / denominator;
  const center = (p + z2 / (2 * denominator)) / d;
  const half = 1.96 * Math.sqrt(p * (1 - p) / denominator + z2 / (4 * denominator ** 2)) / d;
  return { numerator, denominator, value: p, wilson95: [Math.max(0, center - half), Math.min(1, center + half)] };
}
export function metrics(items) {
  const labelled = items.filter(r => r.human);
  const count = (h, d) => labelled.filter(r => r.human === h && r.decision === d).length;
  const tp = count('accepted', 'accept'), fp = count('rejected', 'accept'), fn = count('accepted', 'reject'), tn = count('rejected', 'reject');
  return { total: items.length, labelled: labelled.length, tp, fp, fn, tn,
    abstained_approved: count('accepted', 'uncertain'), abstained_rejected: count('rejected', 'uncertain'),
    precision: rate(tp, tp + fp), false_accepts: rate(fp, labelled.filter(r => r.human === 'rejected').length),
    false_rejects: rate(fn, labelled.filter(r => r.human === 'accepted').length),
    uncertainty: rate(items.filter(r => r.decision === 'uncertain').length, items.length),
    decision_coverage: rate(items.filter(r => r.decision !== 'uncertain').length, items.length) };
}
function cachedDecision(c, kind, p) {
  const target = prompt(c), wanted = kind === 'baseline' ? baseline : model;
  const expected = kind === 'baseline' ? [target.slice(0, 200), ...policy.alternatives] : [target, ...p.judge.alternatives];
  const results = kind === 'baseline' ? c.evidence.analyses.map(a => ({ result: a.result, target: a.request.target })) :
    c.evaluation?.evidence ? [{ result: c.evaluation.evidence.result, target: c.evaluation.evidence.target, evaluation: c.evaluation }] : [];
  for (const { result, target: recordedTarget, evaluation } of results) {
    if (result?.audio_sha256 !== audioHash(c) || result.clap?.model?.model !== wanted.model || result.clap.model.revision !== wanted.revision ||
      !isDeepStrictEqual(result.clap.model.files?.map(f => [f.file ?? f.path?.split('/').at(-1), f.sha256]).sort(), wanted.files.map(f => [f.file, f.sha256]).sort()) ||
      recordedTarget !== expected[0] || !isDeepStrictEqual(result.clap.descriptions, [...new Set(expected)])) continue;
    if (evaluation && (evaluation.audio_sha256 !== audioHash(c) || evaluation.model !== wanted.model || evaluation.revision !== wanted.revision ||
      evaluation.rubric_sha256 !== policyHash(evaluation.evidence.policy) || evaluation.evidence.target_sha256 !== digest(recordedTarget) ||
      evaluation.evidence.descriptions_sha256 !== digest(JSON.stringify([recordedTarget, ...evaluation.evidence.policy.alternatives])))) continue;
    const comparison = kind === 'baseline' ? { ...policy, accept_score: -1, accept_margin: 0, reject_score: -1, reject_margin: 0, boundary_peak: 1 } : p.judge;
    return decide(result, expected[0], comparison);
  }
  return { decision: 'uncertain', reason_tags: ['scores_unavailable'] };
}
export function evaluate(dataset, p = defaultPolicy, split = 'holdout', synthetic = false) {
  verifySeal(dataset); validateComparison(p);
  assert(isDeepStrictEqual(dataset.implementation, implementation), 'Evaluation implementation changed; freeze a new benchmark and retain historical results');
  assert(['development', 'holdout'].includes(split), 'Evaluation split must be development or holdout');
  const all = examples(dataset.rows, dataset.assignments, synthetic), selected = all.filter(r => r.split === split);
  const decision = (r, kind) => {
    const values = new Set(r.members.map(m => cachedDecision(m.candidate, kind, p).decision).filter(v => v !== 'uncertain'));
    return values.size === 1 ? [...values][0] : 'uncertain';
  };
  const results = Object.fromEntries(['baseline', 'larger'].map(kind => [kind, metrics(selected.map(r => ({ ...r, decision: decision(r, kind) })))]));
  const byCandidate = new Map(all.flatMap(r => r.members.map(m => [m.candidate.candidate_sha256, r])));
  const trials = [];
  for (const job of dataset.jobs) {
    if (job.parent_id) continue; // Explicit human continuations are separate budgets, not automatic policy trials.
    const initial = dataset.rows.find(r => r.candidate.attempt_id === job.attempts?.[0]?.id && r.candidate.evidence.cut && !Object.keys(r.candidate.evidence.cut.request).length);
    const first = byCandidate.get(initial?.candidate.candidate_sha256 ?? job.attempts?.[0]?.result?.candidate_sha256);
    if (!first || first.split !== split) continue;
    let chosen = null, attempts = 0, latency = 0, completeTiming = true, missing = false;
    for (const attempt of (job.attempts ?? []).slice(0, Math.min(p.selection.attempts, job.input.budget?.attempts ?? 1))) {
      const r = byCandidate.get(attempt.result?.candidate_sha256);
      if (!r) { missing = true; break; }
      const candidates = (job.candidate_ids ?? []).map(id => dataset.rows.find(x => x.candidate.candidate_sha256 === id)).filter(x => x && x.candidate.attempt_id === attempt.id && x.candidate.evidence.cut && x.candidate.evaluation);
      let c = candidates.find(x => !Object.keys(x.candidate.evidence.cut.request).length)?.candidate;
      if (!c) { missing = true; break; }
      let verdict = cachedDecision(c, 'larger', p);
      const used = [c];
      if (p.selection.region !== 'first' && verdict.reason_tags.some(tag => ['active_boundary', 'silence', 'bad_trim'].includes(tag))) {
        const alternate = candidates.find(x => attempt.alternate && isDeepStrictEqual(x.candidate.evidence.cut.request, attempt.alternate))?.candidate;
        if (!alternate) { missing = true; break; }
        c = alternate; used.push(c); verdict = cachedDecision(c, 'larger', p);
      }
      attempts++;
      const generationMs = c.evidence.generation.elapsed_ms;
      // Include recorded analysis/cut/judge work once per immutable operation.
      const reports = new Map();
      for (const x of used) {
        for (const report of [...x.evidence.analyses, x.evidence.cut]) reports.set(report.id, report);
      }
      const operationMs = [...reports.values()].map(report => Date.parse(report.finished_at) - Date.parse(report.started_at));
      const judgeMs = used.map(x => x.evaluation.evidence?.elapsed_ms);
      if (![generationMs, ...operationMs, ...judgeMs].every(n => Number.isFinite(n) && n >= 0)) completeTiming = false;
      else latency += generationMs + operationMs.reduce((a,b) => a+b,0) + judgeMs.reduce((a,b) => a+b,0);
      if (!completeTiming || latency > Math.min(p.selection.milliseconds, (job.input.budget?.minutes ?? 20) * 60000)) { missing = true; break; }
      const d = verdict.decision;
      if (d === 'accept') { chosen = { ...byCandidate.get(c.candidate_sha256), candidate_sha256: c.candidate_sha256 }; break; }
      if (d === 'uncertain') break;
      if (attempts < Math.min(p.selection.attempts, job.input.budget?.attempts ?? 1) && attempt === job.attempts.at(-1)) missing = true;
    }
    trials.push({ job: job.id, first_human: first.human, selected: chosen?.candidate_sha256 ?? null, human: chosen?.human ?? null,
      attempts, latency_ms: completeTiming ? latency : null, missing_evidence: missing });
  }
  const selectedLabels = trials.filter(t => t.selected && t.human);
  const pairedSelections = selectedLabels.filter(t => t.first_human && !t.missing_evidence);
  results.bounded = { trials: trials.length, selected: trials.filter(t => t.selected).length,
    unresolved: trials.filter(t => !t.selected).length, missing_evidence: trials.filter(t => t.missing_evidence).length,
    selection_coverage: rate(trials.filter(t => t.selected).length, trials.length),
    human_approval: rate(selectedLabels.filter(t => t.human === 'accepted').length, selectedLabels.length),
    paired_selection_approval: rate(pairedSelections.filter(t => t.human === 'accepted').length, pairedSelections.length),
    paired_first_approval: rate(pairedSelections.filter(t => t.first_human === 'accepted').length, pairedSelections.length),
    first_attempt_approval: rate(trials.filter(t => t.first_human === 'accepted').length, trials.filter(t => t.first_human).length),
    attempts: { total: trials.reduce((n,t) => n+t.attempts,0), denominator: trials.length },
    latency_ms: { total: trials.reduce((n,t) => n+(t.latency_ms ?? 0),0), denominator: trials.filter(t => t.latency_ms !== null).length },
    resource_use: 'Cached replay only; no generation/inference. Historical peak memory is not recorded.', outcomes: trials };
  const b = results.baseline, l = results.larger, s = results.bounded;
  const comparable = selected.filter(r => r.human && decision(r, 'baseline') !== 'uncertain' && decision(r, 'larger') !== 'uncertain');
  const pairedBaseline = metrics(comparable.map(r => ({ ...r, decision: decision(r, 'baseline') })));
  const pairedLarger = metrics(comparable.map(r => ({ ...r, decision: decision(r, 'larger') })));
  results.paired = { clips: comparable.length, baseline: pairedBaseline, larger: pairedLarger };
  const assessment = {
    false_accept_reduction: pairedBaseline.fp ? 1 - pairedLarger.fp / pairedBaseline.fp : null,
    precision: l.precision.value, false_reject_rate: l.false_rejects.value,
    selection_approval_increase: s.paired_selection_approval.value !== null && s.paired_first_approval.value !== null ? s.paired_selection_approval.value - s.paired_first_approval.value : null,
  };
  return seal({ schema: 'audio-factory-evaluation-result@1', benchmark: dataset.sha256, policy: digest(p), split,
    population: synthetic ? 'synthetic_fixture_only' : 'real_human_feedback', status: 'quality_not_established',
    coverage: coverage(dataset.rows, dataset.assignments), results, targets: dataset.targets, exploratory_target_estimates: assessment,
    limitations: ['Exploratory estimates; correlated clips make per-clip Wilson intervals descriptive, not proof of target attainment.',
      'Family map must be reviewed for related prompts and near-duplicate source lineages before any quality claim.',
      'Cached replay cannot invent unrecorded retries, alternate regions, descriptions or baseline scores. Missing evidence abstains.',
      'Selection approval rates use available selected human labels; missing outcomes are reported and cannot establish improvement.'] });
}

function immutable(directory, value) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const id = digest(value), path = join(directory, id + '.json');
  try { writeFileSync(path, serialize(value), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; assert(isDeepStrictEqual(json(path), value), 'Immutable record conflict'); }
  return id;
}
function record(directory, id) {
  assert(typeof id === 'string' && /^[a-f0-9]{64}$/.test(id), 'Invalid evaluation ID');
  const value = json(join(directory, id + '.json')); assert(digest(value) === id, 'Evaluation record hash mismatch'); return value;
}
export function openEvaluation(root) {
  const folder = kind => join(root, kind);
  return {
    freeze(dataset) { verifySeal(dataset); return immutable(folder('benchmarks'), dataset); },
    register(benchmarkId, p = defaultPolicy, split = 'development') {
      assert(split === 'development', 'Policy changes require development data');
      const dataset = record(folder('benchmarks'), benchmarkId);
      // Once holdout has been inspected, this benchmark accepts no new policy versions.
      const id = digest(p);
      if (existsSync(folder('results'))) for (const name of readdirSync(folder('results'))) {
        const r = record(folder('results'), name.replace('.json', ''));
        if (r.benchmark === dataset.sha256 && r.split === 'holdout') {
          assert(existsSync(join(folder('policies'), id + '.json')) && existsSync(join(folder('tests'), digest({ benchmarkId, policy: id }) + '.json')), 'Holdout already inspected; freeze a new untouched benchmark before tuning');
        }
      }
      if (existsSync(folder('results'))) for (const name of readdirSync(folder('results'))) {
        const old = record(folder('results'), name.replace('.json', ''));
        if (old.split !== 'holdout') continue;
        for (const file of readdirSync(folder('benchmarks'))) {
          const previous = record(folder('benchmarks'), file.replace('.json', ''));
          if (previous.sha256 !== old.benchmark) continue;
          const held = new Set(previous.assignments.filter(a => a.split === 'holdout').map(a => a.candidate_sha256));
          const keys = new Set(previous.rows.filter(r => held.has(r.candidate.candidate_sha256)).flatMap(r => [
            audioHash(r.candidate), r.candidate.evidence.generation.audio_sha256, normalized(prompt(r.candidate)), previous.families[prompt(r.candidate)] ?? normalized(prompt(r.candidate))]));
          const dev = new Set(dataset.assignments.filter(a => a.split === 'development').map(a => a.candidate_sha256));
          assert(!dataset.rows.filter(r => dev.has(r.candidate.candidate_sha256)).some(r => [audioHash(r.candidate),
            r.candidate.evidence.generation.audio_sha256, normalized(prompt(r.candidate)), dataset.families[prompt(r.candidate)] ?? normalized(prompt(r.candidate))].some(k => keys.has(k))), 'Previously inspected holdout overlaps development');
        }
      }
      validateComparison(p);
      immutable(folder('policies'), p);
      const report = evaluate(dataset, p, 'development');
      immutable(folder('results'), report);
      immutable(folder('tests'), { benchmarkId, policy: id });
      return { policy: id, report };
    },
    run(benchmarkId, policyId, split = 'holdout', synthetic = false) {
      const dataset = record(folder('benchmarks'), benchmarkId), p = record(folder('policies'), policyId);
      record(folder('tests'), digest({ benchmarkId, policy: policyId }));
      const report = evaluate(dataset, p, split, synthetic);
      return { id: immutable(folder('results'), report), report };
    },
    select(benchmarkId, policyId) {
      const p = record(folder('policies'), policyId); validateComparison(p);
      record(folder('tests'), digest({ benchmarkId, policy: policyId }));
      const previous = existsSync(join(root, 'active.json')) ? json(join(root, 'active.json')) : null;
      const next = { benchmarkId, policy: policyId };
      immutable(folder('selections'), { previous, next, timestamp: new Date().toISOString() });
      const temporary = join(root, 'active.pending.json');
      writeFileSync(temporary, serialize(next), { mode: 0o600 }); renameSync(temporary, join(root, 'active.json'));
      return next;
    },
  };
}
export function selectedPolicy(root) {
  const directory = join(root, '.runtime/evaluation');
  if (!existsSync(join(directory, 'active.json'))) return null;
  const active = json(join(directory, 'active.json'));
  record(join(directory, 'tests'), digest({ benchmarkId: active.benchmarkId, policy: active.policy }));
  return validateComparison(record(join(directory, 'policies'), active.policy));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  const registry = openEvaluation(resolve('.runtime/evaluation'));
  let result;
  if (command === 'export') {
    const [storePath, destination, familyFile] = args;
    assert(storePath && destination, 'export STORE_PATH NEW_JSON [FAMILIES_JSON]');
    const store = openReviewStore(storePath);
    const jobsPath = join(storePath, 'jobs');
    const jobs = existsSync(jobsPath) ? readdirSync(jobsPath).filter(n => /^[a-f0-9]{32}\.json$/.test(n)).sort().map(n => json(join(jobsPath,n))) : [];
    const dataset = exportDataset(store, jobs, familyFile ? json(familyFile) : {});
    writeFileSync(destination, serialize(dataset), { flag: 'wx', mode: 0o600 });
    result = { path: resolve(destination), sha256: dataset.sha256, coverage: coverage(dataset.rows, dataset.assignments) };
  } else if (command === 'import') {
    result = { candidates: importDataset(json(args[0]), args[1]).listCandidates().length, destination: resolve(args[1]) };
  } else if (command === 'freeze') {
    const dataset = json(args[0]);
    const temporary = mkdtempSync(resolve('.runtime/evaluation-verify-'));
    try { importDataset(dataset, join(temporary, 'store')); result = { benchmark: registry.freeze(dataset) }; }
    finally { rmSync(temporary, { recursive: true, force: true }); }
  } else if (command === 'register') result = registry.register(args[0], args[1] ? json(args[1]) : defaultPolicy);
  else if (command === 'run') result = registry.run(args[0], args[1], args[2] ?? 'holdout', args[3] === '--synthetic');
  else if (command === 'select') result = registry.select(args[0], args[1]);
  else throw new Error('Commands: export, import, freeze, register, run, select (select an earlier tested policy to roll back)');
  console.log(JSON.stringify(result, null, 2));
}
