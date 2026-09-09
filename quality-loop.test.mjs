import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import test from 'node:test';
import { createServer } from 'node:net';
import { createStudio } from './studio.mjs';
import { openJobs, runWorkflow, workflowInput } from './workflow.mjs';
import { decide, judge, policy } from './judge.mjs';
import { hash } from './dist/config.js';
import { wavFixture } from './wav-fixture.mjs';
import { verifyExport } from './export-lineage.mjs';
import { fallbackPlan } from './prompt-plan.mjs';

const input = { mode: 'automatic', request: { prompt: 'A short tone', duration_seconds: 1, seed: 42 } };
const token = 'quality-loop-fixture';
const wave = wavFixture(t => t > .1 && t < .25 || t > .6 && t < .8);
export function fixture(root, sequence = ['rejected', 'auto_accepted']) {
  let count = 0, scores = 0;
  const record = value => appendFileSync(join(root, 'operations.jsonl'), JSON.stringify(value) + '\n');
  return { root, token, port: 0, computePort: 0, fixture: true, setup: async () => {},
    backend: { start: async () => {}, stop: async () => {}, reset: async () => {}, unload: async () => {},
      async generate(request) { count++; record({ operation: 'generate', seed: request.seed }); return wave; } },
    async evaluate(path, target) {
      const audio_sha256 = hash(await readFile(path));
      const wanted = sequence[Math.min(scores++, sequence.length - 1)];
      record({ operation: 'judge', audio_sha256, wanted });
      const score = wanted === 'rejected' ? .1 : wanted === 'below_acceptance' ? .28 : .5;
      const margin = wanted === 'needs_review' ? .02 : .1;
      const result = { silence: { fraction: 0 }, clipping_fraction: 0, boundary_peak: wanted === 'trim' ? .1 : 0,
        clap: { status: 'completed', scores: [{ kind: 'window', start_seconds: 0, end_seconds: 1, target_margin: margin,
          ranking: [{ description: target, similarity: score }, ...policy.alternatives.map(description => ({ description, similarity: score - margin }))] }] } };
      const decision = decide(result, target);
      return { actor: 'automatic', audio_sha256, model: 'controlled-policy-input', revision: 'fixture-only', rubric_sha256: hash(JSON.stringify(policy)),
        verdict: decision.decision === 'accept' ? 'auto_accepted' : decision.decision === 'reject' ? 'rejected' : 'needs_review',
        reason_tags: decision.reason_tags, note: 'Synthetic policy fixture; no acoustic accuracy claim.',
        evidence: { ...decision, policy, target, target_sha256: hash(target), descriptions_sha256: hash(JSON.stringify([target, ...policy.alternatives])), elapsed_ms: 0, error: null, result } };
    },
    counts: () => ({ count, scores }),
  };
}
const operations = async root => (await readFile(join(root, 'operations.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
const feedback = (id, verdict = 'rejected') => ({ event_id: 'a'.repeat(32), candidate_sha256: id, actor: 'human', verdict, supersedes: null, reason_tags: ['wrong_sound'], note: 'Synthetic technical check, not listening.' });

if (process.argv[2] === '--crash') {
  const root = process.argv[3], phase = process.argv[4];
  const options = fixture(root, phase.startsWith('alternate') ? ['trim', 'auto_accepted'] : undefined);
  const jobs = await openJobs({ ...options, execute: (job, execution) => runWorkflow(job, { ...execution, save: async () => {
    await execution.save();
    const attempt = job.attempts.at(-1);
    const c = attempt.candidate_id && execution.store.loadCandidate(attempt.candidate_id);
    if (phase === 'source' && c && !c.evidence.analyses.length || phase === 'cut' && c?.evidence.cut && !c.evaluation ||
        phase === 'judging' && attempt.inflight === 'evaluating' || phase === 'evaluated' && c?.evaluation ||
        phase === 'retry' && job.attempt === 2 || phase === 'alternate' && attempt.inflight === 'cutting' && attempt.alternate ||
        phase === 'alternate-evaluated' && attempt.alternate && c?.evaluation?.verdict === 'auto_accepted') process.exit(23);
  } }) });
  // Retry checkpoint is persisted by the job runner before runWorkflow enters attempt 2.
  await jobs.submit('restart', input); await jobs.wait(); throw new Error('Crash checkpoint not reached');
} else if (process.argv[2] === '--browser') {
  const root = await mkdtemp(resolve('.runtime/quality-browser-'));
  const options = fixture(root);
  let studio = await createStudio(options);
  const port = studio.server.address().port;
  await writeFile('.test-artifacts/m02-quality-browser.json', JSON.stringify({ root, port, pid: process.pid }));
  console.log(JSON.stringify({ root, port, pid: process.pid }));
  process.on('SIGUSR2', async () => { await studio.close(); studio = await createStudio({ ...options, port }); console.log('Restarted same request store'); });
  process.on('SIGTERM', async () => { await studio.close(); await rm(root, { recursive: true, force: true }); console.log('Owned browser fixture removed'); });
} else {
  test('one saved prompt plan drives distinct retries, stable QA, exports and later trims', async () => {
    const root = await mkdtemp(resolve('.runtime/prompt-workflow-'));
    const options = fixture(root, ['rejected', 'rejected', 'auto_accepted']);
    const plan = { ...fallbackPlan(input.request.prompt, ''), status: 'completed', error: null,
      generation_prompts: ['A short tone.', 'A brief clear tone.', 'A tone starts and fades.'], qa_target: 'This is a sound of a short tone.' };
    let planned = 0;
    options.preparePrompts = async intent => { planned++; assert.equal(intent, input.request.prompt); return plan; };
    const prompts = [], targets = [];
    const generate = options.backend.generate, evaluate = options.evaluate;
    options.backend.generate = async request => { prompts.push(request.prompt); return generate(request); };
    options.evaluate = async (path, target) => { targets.push(target); return evaluate(path, target); };
    let studio = await createStudio(options);
    try {
      const job = await studio.jobs.submit('prompt-plan', input); await studio.jobs.wait();
      assert.equal(job.outcome, 'auto_accepted', job.error);
      assert.equal(planned, 1);
      assert.deepEqual(prompts, plan.generation_prompts);
      assert.deepEqual(targets, Array(3).fill(plan.qa_target));
      assert.equal(job.input.request.prompt, input.request.prompt);
      const c = studio.jobs.store.loadCandidate(job.result.candidate_sha256);
      assert.deepEqual(c.evidence.generation.prompt_plan, plan);
      assert.equal(c.evidence.generation.request.prompt, plan.generation_prompts[2]);
      verifyExport(c.evidence, studio.jobs.store.readAsset(c.candidate_sha256, 'audio'), () => wave);
      const cut = await studio.jobs.cut(c.candidate_sha256, { start_seconds: .1, end_seconds: .3 });
      assert.equal(cut.evaluation.evidence.target, plan.qa_target);
      await studio.close(); studio = await createStudio(options);
      assert.equal((await studio.jobs.submit('prompt-plan', input)).id, job.id);
      assert.equal(planned, 1);
    } finally { await studio.close(); await rm(root, { recursive: true, force: true }); }
  });
  test('automatic outcomes, exact budgets, seed history, human override and portable export', async () => {
    assert.deepEqual(workflowInput(input).budget, { attempts: 3, minutes: 20 });
    for (const [sequence, expected, count] of [[['below_acceptance', 'auto_accepted'], 'auto_accepted', 2], [['below_acceptance'], 'exhausted', 3], [['rejected', 'auto_accepted'], 'auto_accepted', 2], [['rejected'], 'exhausted', 3], [['needs_review'], 'needs_review', 1], [['trim', 'auto_accepted'], 'auto_accepted', 1]]) {
      const root = await mkdtemp(resolve('.runtime/quality-sequence-'));
      const options = fixture(root, sequence);
      let studio = await createStudio(options);
      const generate = options.backend.generate;
      options.backend.generate = async request => {
        const firstId = studio.jobs.list()[0]?.attempts?.[0].result?.candidate_sha256;
        if (firstId) {
          const history = studio.jobs.store.history(firstId);
          if (!history.length) studio.jobs.store.feedback(feedback(firstId));
          assert.equal(studio.jobs.store.history(firstId)[0].verdict, 'rejected');
        }
        return generate(request);
      };
      try {
        const job = await studio.jobs.submit('sequence', input);
        await studio.jobs.wait();
        assert.equal(job.outcome, expected, job.error);
        assert.equal(options.counts().count, count);
        assert.equal(new Set(job.attempts.map(a => a.seed)).size, count);
        assert.ok(job.attempts.every(a => a.result && a.reason));
        assert.equal((await studio.jobs.submit('sequence', input)).id, job.id);
        const first = studio.jobs.store.loadCandidate(job.attempts[0].result.candidate_sha256);
        const prior = studio.jobs.store.history(first.candidate_sha256).at(-1);
        studio.jobs.store.feedback({ ...feedback(first.candidate_sha256, 'accepted'), event_id: 'b'.repeat(32), supersedes: prior?.event_id ?? null });
        const url = `http://127.0.0.1:${studio.server.address().port}`;
        const response = await fetch(`${url}/studio/candidates/${first.candidate_sha256}/export`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(response.status, 200);
        const archive = join(root, 'export.tar'); await writeFile(archive, Buffer.from(await response.arrayBuffer()));
        const target = join(root, 'export'); await mkdir(target);
        assert.equal(spawnSync('tar', ['-xf', archive, '-C', target]).status, 0);
        const exported = JSON.parse(await readFile(join(target, 'candidate.json')));
        const human = JSON.parse(await readFile(join(target, 'feedback.json'))).at(-1);
        assert.equal(exported.candidate_sha256, first.candidate_sha256);
        assert.equal(exported.evaluation.audio_sha256, first.evidence.cut.audio_sha256);
        assert.equal(human.candidate_sha256, first.candidate_sha256); assert.equal(human.verdict, 'accepted');
        verifyExport(first.evidence, studio.jobs.store.readAsset(first.candidate_sha256, 'audio'), () => wave);
        if (sequence[0] === 'trim') {
          const judged = studio.jobs.store.listCandidates().filter(c => c.evaluation);
          assert.equal(judged.length, 2); assert.equal(options.counts().scores, 2);
          assert.equal(new Set(judged.map(c => c.evidence.generation.audio_sha256)).size, 1);
          assert.equal(new Set(judged.map(c => c.evidence.cut.audio_sha256)).size, 2);
          for (const c of judged) assert.equal(c.evaluation.audio_sha256, c.evidence.cut.audio_sha256);
        }
        const before = options.counts().count;
        if (expected === 'exhausted') {
          await assert.rejects(studio.jobs.retry(job.id, 'over'), /exhausted/);
          const next = await studio.jobs.continue(job.id, 'additional', { attempts: 1, minutes: 1 });
          await studio.jobs.wait(); assert.equal(next.parent_id, job.id); assert.equal(options.counts().count, before + 1);
          assert.equal((await studio.jobs.continue(job.id, 'additional', { attempts: 1, minutes: 1 })).id, next.id);
        }
        await studio.close();
        if (sequence.length === 2 && sequence[0] === 'rejected') {
          for (const name of ['dist', 'evaluation.mjs', 'docs/tasks/m02/clap-m1-baseline.lock.json', 'workflow.mjs', 'review-store.mjs', 'judge.mjs', 'prompt-plan.mjs', 'judge-policy.json', 'export-lineage.mjs', 'config.json', 'qa-config.json', 'qa-model.lock.json', ...(await readdir('.')).filter(n => n.endsWith('.schema.json'))])
            await cp(resolve(name), join(root, name), { recursive: true });
          await writeFile(join(root, 'workflow-input.json'), JSON.stringify(input));
          const cli = spawnSync(process.execPath, [join(root, 'dist/cli.js'), 'workflow', join(root, 'workflow-input.json'), 'sequence'], { timeout: 15000, encoding: 'utf8' });
          assert.equal(cli.status, 0, cli.stderr);
          assert.equal(JSON.parse(cli.stdout).id, job.id);
          assert.equal(JSON.parse(cli.stdout).outcome, 'auto_accepted');
          assert.equal((await operations(root)).filter(o => o.operation === 'generate').length, 2);
          console.log('CLI workflow reattached to the same durable request without computation');
        }
        const moved = root + '-moved'; await cp(root, moved, { recursive: true }); await rm(root, { recursive: true, force: true });
        studio = await createStudio({ ...options, root: moved });
        assert.equal(studio.jobs.get(job.id).outcome, expected);
        assert.equal(studio.jobs.store.history(first.candidate_sha256).at(-1).verdict, 'accepted');
        await studio.close(); await rm(moved, { recursive: true, force: true });
        console.log(JSON.stringify({ sequence, outcome: expected, generation_count: before, seeds: job.attempts.map(a => a.seed), candidates: job.candidate_ids }));
      } finally { await studio.close(); await rm(root, { recursive: true, force: true }); }
    }
  });

  test('missing judge, timeout, cancellation and time exhaustion never regenerate', async () => {
    for (const kind of ['missing', 'timeout', 'cancel', 'generation-cancel', 'deadline']) {
      const root = await mkdtemp(resolve('.runtime/quality-failure-'));
      const options = fixture(root);
      let jobs, entered;
      const boundary = new Promise(resolve => { entered = resolve; });
      if (kind === 'generation-cancel') options.backend.generate = async () => { entered(); await new Promise(resolve => { options.backend.stop = async () => resolve(); }); throw new Error('Generation cancelled'); };
      else options.evaluate = async (path, target, { signal }) => {
        entered();
        if (kind === 'missing') return judge(path, target, { python: join(root, 'missing-python') });
        if (kind === 'timeout') return judge(path, target, { timeout: 1 });
        await new Promise(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', resolve, { once: true }); });
        signal.throwIfAborted();
      };
      if (kind === 'deadline') options.execute = (job, execution) => { job.budget_started_at = new Date(Date.now() - 58000).toISOString(); return runWorkflow(job, execution); };
      jobs = await openJobs(options);
      try {
        const job = await jobs.submit(kind, { ...input, budget: { attempts: 3, minutes: 1 } });
        if (kind === 'cancel' || kind === 'generation-cancel') { await boundary; await jobs.cancel(job.id); }
        await jobs.wait();
        assert.equal(job.outcome, kind.includes('cancel') ? 'cancelled' : kind === 'deadline' ? 'exhausted' : kind === 'missing' ? 'needs_review' : 'operational-error', job.error);
        if (kind === 'timeout') assert.equal(job.status, 'failed', 'Judge timeout must not report successful completion to CLI clients');
        assert.ok(options.counts().count <= 1);
        if (kind !== 'generation-cancel') assert.ok(job.candidate_ids.length);
      } finally { await jobs.close(); await rm(root, { recursive: true, force: true }); }
    }
  });

  test('legacy compute mutations cannot overlap the delivered judge', async () => {
    const root = await mkdtemp(resolve('.runtime/quality-contention-'));
    const reservation = createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const options = fixture(root);
    const evaluate = options.evaluate;
    options.computePort = port;
    options.evaluate = async (...args) => {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'unexpected' };
      for (const [path, value] of [['/v1/sound-effects', input.request], [`/v1/runs/${hash(hash('contention').slice(0,32)).slice(0,32)}/analyses`, { clap: false }]]) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers, body: JSON.stringify(value) });
        assert.equal(response.status, 429);
      }
      return evaluate(...args);
    };
    const jobs = await openJobs(options);
    try {
      const job = await jobs.submit('contention', { ...input, budget: { attempts: 1, minutes: 1 } });
      await jobs.wait(); assert.equal(job.outcome, 'exhausted', job.error); assert.equal(options.counts().count, 1);
    } finally { await jobs.close(); await rm(root, { recursive: true, force: true }); }
  });

  test('persistence failure stops before regeneration and restart retains cancellation', async () => {
    const root = await mkdtemp(resolve('.runtime/quality-persistence-'));
    const options = fixture(root);
    let poisoned = false;
    const jobs = await openJobs({ ...options, execute: (job, execution) => runWorkflow(job, { ...execution, save: async () => {
      await execution.save();
      const id = job.attempts.at(-1).candidate_id;
      if (!poisoned && id && execution.store.loadCandidate(id).evaluation) {
        execution.store.feedback(feedback(id));
        poisoned = true;
        await rename(join(root, '.runtime/studio/jobs'), join(root, '.runtime/studio/jobs-backup'));
        await writeFile(join(root, '.runtime/studio/jobs'), 'Controlled persistence failure');
      }
    } }) });
    try {
      const job = await jobs.submit('persistence', input);
      await assert.rejects(jobs.wait(), /ENOTDIR/);
      assert.equal(options.counts().count, 1);
      assert.ok(jobs.store.listCandidates().some(c => jobs.store.history(c.candidate_sha256).length));
      await assert.rejects(jobs.submit('no-more-work', input), /stopping/);
      await assert.rejects(jobs.close(), /ENOTDIR/);
      await rm(join(root, '.runtime/studio/jobs'));
      await rename(join(root, '.runtime/studio/jobs-backup'), join(root, '.runtime/studio/jobs'));
      // Restore only the owned fixture before removing it; cancellation recovery is checked separately.
      assert.ok(job.candidate_ids.length >= 4);
    } finally { await rm(root, { recursive: true, force: true }); }
    const cancelledRoot = await mkdtemp(resolve('.runtime/quality-cancel-restart-'));
    let reopened = await openJobs(fixture(cancelledRoot));
    try {
      const job = await reopened.submit('cancelled', { ...input, qa: { clap: false } });
      await reopened.wait(); await reopened.close();
      job.status = 'canceling';
      await writeFile(join(cancelledRoot, '.runtime/studio/jobs', job.id + '.json'), JSON.stringify(job));
      const options = fixture(cancelledRoot);
      reopened = await openJobs(options);
      assert.equal(reopened.get(job.id).outcome, 'cancelled');
      assert.equal(reopened.get(job.id).status, 'canceled');
      await assert.rejects(reopened.recover(job.id), /checkpoint/);
      assert.equal(options.counts().count, 0);
    } finally { await reopened.close(); await rm(cancelledRoot, { recursive: true, force: true }); }
  });

  test('hard restart and relocation reuse persisted generation/cut/judge/retry without duplicate operations', async () => {
    for (const phase of ['source', 'cut', 'evaluated', 'retry', 'judging', 'alternate', 'alternate-evaluated']) {
      const original = await mkdtemp(resolve('.runtime/quality-restart-'));
      const root = original + '-moved';
      const child = spawnSync(process.execPath, [resolve('quality-loop.test.mjs'), '--crash', original, phase], { timeout: 30000, encoding: 'utf8' });
      assert.equal(child.status, 23, child.stderr + child.stdout);
      await cp(original, root, { recursive: true }); await rm(original, { recursive: true, force: true });
      await rm(join(root, 'out'), { recursive: true, force: true });
      const before = await operations(root);
      const options = fixture(root, ['auto_accepted']);
      const jobs = await openJobs(options);
      try {
        const job = jobs.list()[0];
        assert.equal(job.status, 'interrupted');
        assert.deepEqual(await operations(root), before);
        await jobs.recover(job.id); await jobs.wait();
        if (['judging', 'alternate'].includes(phase)) {
          assert.equal(job.outcome, 'operational-error'); assert.equal(options.counts().count, 0); assert.equal(options.counts().scores, 0);
        } else {
          assert.equal(job.outcome, 'auto_accepted', job.error);
          assert.equal(options.counts().count, ['evaluated', 'retry'].includes(phase) ? 1 : 0);
          assert.equal(options.counts().scores, phase === 'alternate-evaluated' ? 0 : 1);
        }
        assert.ok(job.candidate_ids.every(id => jobs.store.loadCandidate(id)));
        console.log(JSON.stringify({ phase, before, after: await operations(root), outcome: job.outcome }));
      } finally { await jobs.close(); await rm(root, { recursive: true, force: true }); }
    }
  });
}
