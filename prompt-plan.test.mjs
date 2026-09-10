import assert from 'node:assert/strict';
import test from 'node:test';
import { preparePromptPlan } from './prompt-plan.mjs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { workflowInput, openJobs } from './workflow.mjs';

test('one local request yields validated prompts; invalid, unavailable and canceled requests are bounded', async () => {
  const intent = '  A cat hissing\nConstraints: no music  ';
  const output = { generation_prompts: ['A breathy hiss from a cat.', 'A cat makes a raspy hiss.', 'A dry feline hiss.', 'A cat breathes out a hiss.'].map(p => 'TrackType: SFX, ' + p) };
  let calls = 0;
  const request = async (url, options) => {
    calls++;
    assert.equal(url, 'http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(options.body);
    assert.equal(body.keep_alive, 0);
    assert.equal(body.messages[1].content, intent);
    return Response.json({ done: true, done_reason: 'stop', message: { content: JSON.stringify(output) } });
  };
  const plan = await preparePromptPlan(intent, { request });
  assert.equal(calls, 1);
  assert.equal(plan.status, 'completed');
  assert.equal(plan.intent, intent);
  assert.deepEqual(plan.generation_prompts, [intent, ...output.generation_prompts]);
  assert.equal(plan.generation_prompts[0], intent);
  const fenced = await preparePromptPlan(intent, { request: async () => Response.json({ done: true, message: { content: '```json\n' + JSON.stringify(output) + '\n```' } }) });
  assert.equal(fenced.status, 'completed');
  for (const invalid of [null, { ...output, generation_prompts: Array(4).fill('TrackType: SFX, same') }, { generation_prompts: ['No prefix', ...output.generation_prompts.slice(1)] }, { ...output, qa_target: 'x'.repeat(201) }]) {
    await assert.rejects(preparePromptPlan(intent, { request: async () => Response.json({ done: true, message: { content: JSON.stringify(invalid) } }) }), /Invalid prompt plan/);
  }
  await assert.rejects(preparePromptPlan(intent, { request: async () => new Response('model unavailable', { status: 404 }) }), /404.*model unavailable/);
  const wait = async (_, { signal }) => { signal.throwIfAborted(); await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); };
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(preparePromptPlan(intent, { request: wait, timeout: 10 }), /timeout/i);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(preparePromptPlan(intent, { request: wait, signal: controller.signal }), /abort/i);
  } finally { clearTimeout(keepAlive); }
});

test('interrupted preparation is saved before calling the model and never replayed on recovery', async () => {
  const root = await mkdtemp(resolve('.runtime/prompt-recovery-'));
  let calls = 0, generated = 0, reached;
  const preparing = new Promise(resolve => { reached = resolve; });
  const options = { root, token: 'fixture', fixture: true,
    execute: async () => { generated++; return { outcome: 'needs_review' }; },
    preparePrompts: async (_, { signal }) => {
      calls++; reached();
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    },
  };
  let jobs = await openJobs(options);
  try {
    const job = await jobs.submit('planning', { request: { prompt: 'A cat hissing' } });
    await preparing;
    const path = `${root}/.runtime/studio/jobs/${job.id}.json`;
    const checkpoint = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(checkpoint.planning_started, true);
    assert.equal(checkpoint.prompt_plan, undefined);
    await jobs.cancel(job.id); await jobs.wait(); await jobs.close();
    assert.equal(generated, 0);
    // Restore the exact checkpoint a hard process exit would have left.
    await writeFile(path, JSON.stringify(checkpoint));
    jobs = await openJobs(options);
    assert.equal(jobs.get(job.id).status, 'interrupted');
    await jobs.recover(job.id); await jobs.wait();
    assert.equal(calls, 1);
    assert.equal(generated, 0);
    assert.match(jobs.get(job.id).error, /planning interrupted/);
  } finally { await jobs.close(); await rm(root, { recursive: true, force: true }); }
});

test('local duration supports 60 seconds while cloud rejects before submission', () => {
  const input = { request: { prompt: 'Rain', duration_seconds: 60 } };
  assert.equal(workflowInput(input).request.duration_seconds, 60);
  assert.throws(() => workflowInput({ ...input, provider: 'elevenlabs' }), /maximum of 30/);
  assert.throws(() => workflowInput({ request: { ...input.request, duration_seconds: 61 } }), /Invalid workflow request/);
});
