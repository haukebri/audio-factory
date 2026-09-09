import assert from 'node:assert/strict';
import test from 'node:test';
import { preparePromptPlan } from './prompt-plan.mjs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openJobs } from './workflow.mjs';

test('one local request yields validated prompts; invalid, unavailable and canceled requests are bounded', async () => {
  const intent = 'A cat hissing';
  const output = { generation_prompts: ['A cat hissing.', 'A breathy hiss from a cat.', 'A cat makes a raspy hiss.'], qa_target: 'This is a sound of a cat hissing.' };
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
  assert.deepEqual(plan.generation_prompts, output.generation_prompts);
  const fenced = await preparePromptPlan(intent, { request: async () => Response.json({ done: true, message: { content: '```json\n' + JSON.stringify(output) + '\n```' } }) });
  assert.equal(fenced.status, 'completed');
  for (const invalid of [null, { ...output, generation_prompts: ['same', 'same', 'same'] }, { ...output, qa_target: 'x'.repeat(201) }]) {
    const fallback = await preparePromptPlan(intent, { request: async () => Response.json({ done: true, message: { content: JSON.stringify(invalid) } }) });
    assert.equal(fallback.status, 'fallback');
    assert.deepEqual(fallback.generation_prompts, [intent]);
  }
  const failed = await preparePromptPlan(intent, { request: async () => new Response('model unavailable', { status: 404 }) });
  assert.match(failed.error, /404.*model unavailable/);
  const wait = async (_, { signal }) => { signal.throwIfAborted(); await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); };
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    assert.equal((await preparePromptPlan(intent, { request: wait, timeout: 10 })).status, 'fallback');
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
    const job = await jobs.submit('planning', { request: { prompt: 'A cat hissing' }, mode: 'automatic' });
    await preparing;
    const path = `${root}/.runtime/studio/jobs/${job.id}.json`;
    const checkpoint = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(checkpoint.prompt_plan_pending, false);
    assert.equal(checkpoint.prompt_plan.status, 'fallback');
    await jobs.cancel(job.id); await jobs.wait(); await jobs.close();
    assert.equal(generated, 0);
    // Restore the exact checkpoint a hard process exit would have left.
    await writeFile(path, JSON.stringify(checkpoint));
    jobs = await openJobs(options);
    assert.equal(jobs.get(job.id).status, 'interrupted');
    await jobs.recover(job.id); await jobs.wait();
    assert.equal(calls, 1);
    assert.equal(generated, 1);
    assert.equal(jobs.get(job.id).prompt_plan.intent, 'A cat hissing');
  } finally { await jobs.close(); await rm(root, { recursive: true, force: true }); }
});
