import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openReviewStore } from './review-store.mjs';
import { exportDataset, importDataset, partition, coverage, metrics, evaluate, digest, defaultPolicy, openEvaluation, selectedPolicy } from './evaluation.mjs';
import { policyHash, decide } from './judge.mjs';
import { config } from './dist/config.js';
import { inspectWav } from './dist/wav.js';
import { wavFixture } from './wav-fixture.mjs';
import { createStudio } from './studio.mjs';
import { openJobs } from './workflow.mjs';
const model = JSON.parse(readFileSync('qa-model.lock.json'));
const baseline = JSON.parse(readFileSync('docs/tasks/m02/clap-m1-baseline.lock.json'));
const id = n => n.toString(16).padStart(32, '0');
function seed(store) {
  const rows = [], jobs = [];
  // Independent expected table: TP=2, FP=1, FN=1, TN=1, abstain approved=1/rejected=1; one unlabelled.
  const cases = [['accepted', .4], ['accepted', .4], ['rejected', .4], ['accepted', .1], ['rejected', .1], ['accepted', .2], ['rejected', .2], [null, .4]];
  cases.forEach(([human, score], i) => {
    const source = wavFixture(t => t > (i+1)/100 && t < .9), sha = digest(source);
    const prompt = `Synthetic family ${i}`;
    const ranking = [{ description: prompt, similarity: score }, ...defaultPolicy.judge.alternatives.map(description => ({ description, similarity: .1 }))];
    const result = { audio_sha256: sha, silence: { fraction: 0 }, clipping_fraction: 0, boundary_peak: 0,
      clap: { status: 'completed', model, descriptions: ranking.map(r => r.description), scores: [{ kind: 'window', start_seconds: 0, end_seconds: 1, target_margin: score-.1, ranking }] } };
    const generation = { schema: 'urban:audio-factory-run@1', id: id(i+1), signature: '2'.repeat(64), status: 'completed',
      request: { prompt, duration_seconds: 1, seed: i }, started_at: '2026-09-09T00:00:00.000Z', finished_at: '2026-09-09T00:00:01.000Z', elapsed_ms: 1000,
      audio_path: `out/runs/${id(i+1)}/audio.wav`, audio: inspectWav(source), audio_sha256: sha,
      models: config.models, runtime: { revision: config.runtime_revision, backend: 'mlx' },
      settings: { steps: config.steps, cfg_scale: 1, duration_padding_sec: 0, peak_db: -3 }, licenses: config.licenses, review: 'Synthetic fixture; no listening' };
    const report = { schema: 'urban:audio-factory-qa@1', id: id(i+100), kind: 'analyses', run_id: generation.id,
      source_sha256: sha, request: { target: prompt }, settings: {}, implementation_sha256: '4'.repeat(64), started_at: generation.started_at, finished_at: generation.finished_at,
      status: 'completed', advisory: true, result: { ...result, clap: { ...result.clap, model: baseline } } };
    const cut = { ...report, id: id(i+200), kind: 'cuts', request: {}, audio_sha256: sha,
      bounds: { start_sample: 0, end_sample: 44100, sample_rate: 44100, fade_seconds: 0 }, ffmpeg: 'synthetic' };
    delete cut.result;
    const evidence = { schema: 'urban:audio-factory-export@1', source_file: `${cut.id}-source.wav`, generation, cut, analyses: [report],
      review: { status: 'provisional', rationale: 'synthetic', analysis_ids: [report.id] } };
    const d = decide(result, prompt);
    const evaluation = { actor: 'automatic', audio_sha256: sha, model: model.model, revision: model.revision,
      rubric_sha256: policyHash(defaultPolicy.judge), verdict: d.decision === 'accept' ? 'auto_accepted' : d.decision === 'reject' ? 'rejected' : 'needs_review',
      reason_tags: d.reason_tags, note: 'Synthetic technical evidence', evidence: { ...d, policy: defaultPolicy.judge, target: prompt,
        target_sha256: digest(prompt), descriptions_sha256: digest(JSON.stringify([prompt, ...defaultPolicy.judge.alternatives])), elapsed_ms: 10, error: null, result } };
    const c = store.saveCandidate({ attempt_id: id(i+1), fixture: true, evidence, evaluation }, source, source);
    if (human) store.feedback({ event_id: id(i+1000), candidate_sha256: c.candidate_sha256, supersedes: null, actor: 'human', verdict: human, reason_tags: [], note: 'Synthetic test label; never real listening' });
    rows.push(c);
    jobs.push({ id: id(i+1), candidate_ids: [c.candidate_sha256], input: { budget: { attempts: 3, minutes: 20 } },
      attempts: [{ id: c.attempt_id, result: { candidate_sha256: c.candidate_sha256 } }] });
  });
  return { rows, jobs };
}
function fixtureRoot() { mkdirSync('.runtime', { recursive: true }); return mkdtempSync(resolve('.runtime/evaluation-test-')); }

test('known confusion table, correction, deduplication, grouped splits, portable immutable import and frozen policy lifecycle', async () => {
  const root = fixtureRoot();
  try {
    const store = openReviewStore(join(root, 'original'));
    const { rows, jobs } = seed(store);
    const first = rows[0], original = store.history(first.candidate_sha256)[0];
    const rejected = store.feedback({ ...original, timestamp: undefined, event_id: id(2000), supersedes: original.event_id, verdict: 'rejected' });
    store.feedback({ ...original, timestamp: undefined, event_id: id(2001), supersedes: rejected.event_id });
    const { candidate_sha256, ...record } = first;
    const duplicate = store.saveCandidate({ ...record, attempt_id: id(3333) }, store.readAsset(candidate_sha256, 'source'), store.readAsset(candidate_sha256, 'audio'));
    store.feedback({ ...original, timestamp: undefined, candidate_sha256: duplicate.candidate_sha256, event_id: id(3000) });
    const dataset = exportDataset(store, jobs, { 'Synthetic family 0': 'related', 'Synthetic family 1': 'related' });
    const assignments = dataset.assignments;
    assert.equal(new Set(assignments.filter(a => [first.candidate_sha256, duplicate.candidate_sha256, rows[1].candidate_sha256].includes(a.candidate_sha256)).map(a => a.split)).size, 1);
    assert.equal(coverage(dataset.rows).human_labelled, 0, 'all explicit fixtures excluded');
    assert.deepEqual(coverage(dataset.rows).missing, { clips: 100, approved: 50, rejected: 50, families: 10 });
    assert.equal(coverage(dataset.rows).corrections, 2);
    const reports = ['development','holdout'].map(split => evaluate(dataset, defaultPolicy, split, true));
    for (const key of ['tp','fp','fn','tn','abstained_approved','abstained_rejected']) {
      assert.equal(reports.reduce((n,r) => n+r.results.larger[key],0), { tp:2, fp:1, fn:1, tn:1, abstained_approved:1, abstained_rejected:1 }[key], key);
    }
    for (const [key, count] of Object.entries({tp:4,fp:3,fn:0,tn:0,abstained_approved:0,abstained_rejected:0})) assert.equal(reports.reduce((n,r)=>n+r.results.baseline[key],0),count, 'M1 proxy '+key);
    const lineageRows = structuredClone(dataset.rows.slice(0,2));
    lineageRows[1].candidate.evidence.generation.audio_sha256 = lineageRows[0].candidate.evidence.generation.audio_sha256;
    assert.equal(new Set(partition(lineageRows).map(a=>a.group)).size,1,'different cuts sharing a source cannot cross splits');
    assert.equal(reports.reduce((n,r) => n+r.results.larger.total,0), 8, 'duplicate audio counted once');
    assert.equal(reports.reduce((n,r) => n+r.results.bounded.trials,0), 8);
    assert.equal(reports.reduce((n,r) => n+r.results.bounded.selected,0), 4);
    const known = metrics([{human:'accepted',decision:'accept'}, {human:'rejected',decision:'accept'}, {human:'accepted',decision:'reject'}, {human:'rejected',decision:'uncertain'}]);
    assert.equal(known.precision.value, .5); assert.equal(known.false_rejects.value, .5); assert.equal(known.uncertainty.value,.25);
    assert.ok(known.precision.wilson95[0] < .1 && known.precision.wilson95[1] > .9);
    assert.equal(metrics([]).precision.value, null);
    const stricter = { ...defaultPolicy, judge: { ...defaultPolicy.judge, accept_score: .5 } };
    assert.equal(['development','holdout'].reduce((n,s)=>n+evaluate(dataset,stricter,s,true).results.larger.tp,0),0);
    const newDescriptions = { ...defaultPolicy, judge: { ...defaultPolicy.judge, alternatives:['New unseen description'] } };
    assert.equal(['development','holdout'].reduce((n,s)=>n+evaluate(dataset,newDescriptions,s,true).results.larger.decision_coverage.numerator,0),0,'new descriptions require new matching scores');
    // Recorded reject→accept sequence: a counterfactual policy may reuse only the actual saved attempts.
    const sequence = { ...jobs[4], candidate_ids:[rows[4].candidate_sha256,rows[0].candidate_sha256], attempts:[...jobs[4].attempts,...jobs[0].attempts] };
    const sequenceData = exportDataset(store,[sequence]);
    const sequenceReport = evaluate(sequenceData,defaultPolicy,sequenceData.assignments.find(a=>a.candidate_sha256===rows[4].candidate_sha256).split,true);
    assert.equal(sequenceReport.results.bounded.attempts.total,2);
    assert.equal(sequenceReport.results.bounded.human_approval.value,1);
    assert.equal(sequenceReport.results.bounded.first_attempt_approval.value,0);
    assert.equal(sequenceReport.results.bounded.outcomes[0].selected,rows[0].candidate_sha256);
    assert.equal(sequenceReport.results.bounded.latency_ms.total,6020);
    const imported = importDataset(dataset, join(root, 'imported'));
    assert.deepEqual(imported.listCandidates(), store.listCandidates());
    assert.deepEqual(imported.history(first.candidate_sha256), store.history(first.candidate_sha256));
    assert.deepEqual(imported.readAsset(first.candidate_sha256, 'audio'), store.readAsset(first.candidate_sha256, 'audio'));
    assert.throws(() => importDataset(dataset, join(root, 'imported')), /must be new/);
    rmSync(join(root,'original'), { recursive: true });
    renameSync(join(root,'imported'), join(root,'relocated'));
    const restarted = execFileSync(process.execPath, ['--input-type=module','-e', `import { openReviewStore } from ${JSON.stringify(new URL('./review-store.mjs',import.meta.url).href)}; console.log(JSON.stringify(openReviewStore(${JSON.stringify(join(root,'relocated'))}).history(${JSON.stringify(first.candidate_sha256)})));`], { encoding:'utf8' });
    assert.deepEqual(JSON.parse(restarted), imported.history ? dataset.rows.find(r=>r.candidate.candidate_sha256===first.candidate_sha256).history : null);
    const registry = openEvaluation(join(root,'.runtime/evaluation')), bench = registry.freeze(dataset);
    const a = registry.register(bench), changed = { ...defaultPolicy, version: 'stricter-dev', judge: { ...defaultPolicy.judge, accept_score: .5 } };
    const b = registry.register(bench, changed);
    assert.throws(() => registry.register(bench, changed, 'holdout'), /development/);
    registry.select(bench,a.policy); assert.deepEqual(selectedPolicy(root), defaultPolicy);
    registry.select(bench,b.policy); assert.deepEqual(selectedPolicy(root), changed);
    registry.select(bench,a.policy);
    const run = registry.run(bench, a.policy, 'holdout', true);
    assert.deepEqual(registry.run(bench,a.policy,'holdout',true),run);
    const bytes = readFileSync(join(root,'.runtime/evaluation/results',run.id+'.json'));
    registry.select(bench,b.policy); registry.select(bench,a.policy);
    assert.deepEqual(readFileSync(join(root,'.runtime/evaluation/results',run.id+'.json')),bytes);
    assert.throws(() => registry.register(bench, { ...changed, version:'after-holdout' }), /Holdout already/);
    assert.throws(() => registry.select(bench,'f'.repeat(64)), /ENOENT/);
    // Active policy is snapshotted in new jobs; changing it cannot alter old job policy.
    const workflow = await openJobs({ root, token:'fixture', execute: async () => ({ outcome:'needs_review' }) });
    try {
      const j = await workflow.submit('snapshot', { request:{prompt:'Policy snapshot', duration_seconds:1}, mode:'automatic' }); await workflow.wait();
      registry.select(bench,b.policy); assert.deepEqual(j.evaluation_policy,defaultPolicy);
      assert.deepEqual((await workflow.submit('snapshot',{request:{prompt:'Policy snapshot',duration_seconds:1},mode:'automatic'})).evaluation_policy,defaultPolicy);
    } finally { await workflow.close(); }
    const tampered = structuredClone(dataset); tampered.assets[Object.keys(tampered.assets)[0]]='bad';
    assert.throws(() => importDataset(tampered,join(root,'bad')),/hash mismatch/);
    // Even with a recomputed outer hash, the store rejects invented actors / damaged audio.
    const reseal = d => { delete d.sha256; d.sha256=digest(d); return d; };
    assert.throws(() => importDataset(reseal(tampered),join(root,'bad')),/Asset hash/);
    const automatic = structuredClone(dataset); automatic.rows.find(r=>r.history.length).history[0].actor='automatic';
    assert.throws(() => importDataset(reseal(automatic),join(root,'auto')), /Invalid review/);
    assert.ok(!existsSync(join(root,'auto')));
    const conflicting = openReviewStore(join(root,'relocated'));
    const dEvent = conflicting.history(duplicate.candidate_sha256).at(-1);
    conflicting.feedback({ ...dEvent,timestamp:undefined,event_id:id(4000),supersedes:dEvent.event_id,verdict:'rejected' });
    const conflictData = exportDataset(conflicting,jobs);
    const conflictReports = ['development','holdout'].map(s=>evaluate(conflictData,defaultPolicy,s,true));
    assert.equal(conflictReports.reduce((n,r)=>n+r.results.larger.labelled,0),6,'conflicting duplicate labels excluded');
    if (process.env.EVALUATION_EVIDENCE) { writeFileSync(process.env.EVALUATION_EVIDENCE, JSON.stringify({ dataset, reports },null,2)); }
    console.log(JSON.stringify({ synthetic_dataset: dataset.sha256, candidate: first.candidate_sha256, audio: first.evaluation.audio_sha256, reports: reports.map(r=>r.sha256), real:coverage(dataset.rows), rollback:run.id }));
  } finally { rmSync(root,{ recursive:true, force:true }); assert.ok(!existsSync(root)); }
});

test('bounded replay selects alternate regions only when the comparison policy requests them', () => {
  const root = fixtureRoot();
  try {
    const store = openReviewStore(join(root, 'store'));
    const { rows, jobs } = seed(store);
    const { candidate_sha256, ...record } = structuredClone(rows[0]);
    const audio = store.readAsset(candidate_sha256, 'audio');
    record.evaluation.evidence.result.boundary_peak = .1;
    const verdict = decide(record.evaluation.evidence.result, record.evidence.generation.request.prompt);
    Object.assign(record.evaluation.evidence, verdict);
    Object.assign(record.evaluation, { verdict: 'needs_review', reason_tags: verdict.reason_tags });
    const first = store.saveCandidate(record, audio, audio);
    record.evidence.cut.id = id(9000);
    record.evidence.cut.request = { start_seconds: 0, end_seconds: 1 };
    record.evaluation = rows[0].evaluation;
    const alternate = store.saveCandidate(record, audio, audio);
    const job = { ...jobs[0], candidate_ids: [first.candidate_sha256, alternate.candidate_sha256],
      attempts: [{ id: first.attempt_id, alternate: record.evidence.cut.request, result: { candidate_sha256: alternate.candidate_sha256 } }] };
    const dataset = exportDataset(store, [job]);
    const split = dataset.assignments.find(a => a.candidate_sha256 === first.candidate_sha256).split;
    const replay = p => evaluate(dataset, p, split, true).results.bounded.outcomes[0];
    assert.equal(replay(defaultPolicy).selected, alternate.candidate_sha256);
    const relaxed = { ...defaultPolicy, judge: { ...defaultPolicy.judge, boundary_peak: .2 } };
    assert.equal(replay(relaxed).selected, first.candidate_sha256);
    assert.equal(replay(relaxed).latency_ms, 3010, 'unused alternate work is excluded');
    const missing = exportDataset(store, [{ ...job, candidate_ids: [first.candidate_sha256], attempts: [{ id: first.attempt_id, result: { candidate_sha256: first.candidate_sha256 } }] }]);
    const outcome = evaluate(missing, defaultPolicy, split, true).results.bounded.outcomes[0];
    assert.equal(outcome.selected, null);
    assert.equal(outcome.missing_evidence, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

if (process.argv.includes('--browser')) {
  const root=fixtureRoot(), store=openReviewStore(join(root,'.runtime/studio'));
  seed(store);
  const studio=await createStudio({root,token:'evaluation-fixture',port:0,fixture:true,execute:async()=>{throw new Error('No generation authorized');}});
  const info={root,pid:process.pid,url:`http://127.0.0.1:${studio.server.address().port}`};
  writeFileSync('.test-artifacts/m02-evaluation-browser.json',JSON.stringify(info)); console.log(info);
  process.once('SIGTERM',async()=>{await studio.close();rmSync(root,{recursive:true,force:true});});
}
