import assert from 'node:assert/strict';
import test from 'node:test';
import { preparePromptPlan } from './prompt-plan.mjs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { workflowInput, openJobs } from './workflow.mjs';

test('surplus model variations keep the original plus four validated prompts', async () => {
  const intent = 'One short rat squeak followed by silence.';
  const prompts = ['Gentle', 'Soft', 'High-pitched', 'Brief', 'Quiet'].map(p => `TrackType: SFX, ${p} rat squeak followed by silence.`);
  const request = async () => Response.json({ done: true, message: { content: '```json\n' + JSON.stringify({ generation_prompts: prompts }) + '\n```' } });
  const plan = await preparePromptPlan(intent, { request });
  assert.deepEqual(plan.generation_prompts, [intent, ...prompts.slice(0, 4)]);
  prompts[1] = prompts[0];
  await assert.rejects(preparePromptPlan(intent, { request }), /uniqueItems/);
  prompts[1] = 'Missing prefix';
  await assert.rejects(preparePromptPlan(intent, { request }), /must start with/);
});

test('model prefix punctuation is normalized while the original stays exact', async () => {
  const intent = 'TrackType: SFX. Rain on pavement.';
  const prompts = ['Steady', 'Soft', 'Dense', 'Gentle'].map(p => `TrackType: SFX. ${p} rain on pavement.`);
  const plan = await preparePromptPlan(intent, { request: async () => Response.json({ done: true, message: { content: JSON.stringify({ generation_prompts: prompts }) } }) });
  assert.equal(plan.generation_prompts[0], intent);
  assert.deepEqual(plan.generation_prompts.slice(1), prompts.map(p => p.replace('SFX.', 'SFX,')));
});

test('rejected plans retain the model response and specific validation failure', async () => {
  const prompts = ['one', 'two', 'three', 'four'].map(p => `TrackType: SFX, ${p}`);
  for (const [content, reason, done_reason = 'stop'] of [
    [JSON.stringify({ generation_prompts: Array(4).fill(prompts[0]) }), /uniqueItems/],
    [JSON.stringify({ generation_prompts: prompts.slice(1) }), /minItems/],
    [JSON.stringify({ generation_prompts: ['original', ...prompts.slice(1)] }), /repeats the original intent/],
    [JSON.stringify({ generation_prompts: ['No prefix', ...prompts.slice(1)] }), /generation_prompts\/0.*TrackType: SFX,/],
    ['not JSON', /SyntaxError/],
    ['{"generation_prompts":', /Incomplete prompt plan/, 'length'],
  ]) {
    const reply = { done: true, done_reason, message: { content } };
    await assert.rejects(preparePromptPlan('original', { request: async () => Response.json(reply) }), error => {
      assert.match(error.message, reason);
      assert.ok(error.message.includes(JSON.stringify(reply)), 'rejected response is preserved');
      assert.match(error.message, /gemma4:latest/);
      return true;
    });
  }
});

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

test('loop guidance reaches prompt planning while the original wording remains separate', async () => {
  const intent = 'Rain on leaves';
  const prompts = ['Soft', 'Steady', 'Dense', 'Quiet'].map(p => `TrackType: SFX, ${p} rain on leaves`);
  const plan = await preparePromptPlan(intent, { loop: true, request: async (_, input) => {
    const body = JSON.parse(input.body);
    assert.match(body.messages[0].content, /Loop requested: Continuous repeatable ambience/);
    assert.equal(body.messages[1].content, intent);
    return Response.json({ done: true, message: { content: JSON.stringify({ generation_prompts: prompts }) } });
  } });
  assert.equal(plan.intent, intent);
  assert.equal(plan.generation_prompts[0], intent);
});
