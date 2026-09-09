import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openJobs } from './workflow.mjs';

test('fresh takes persist sound membership and independent budgets while retries remain idempotent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-sounds-'));
  let calls = 0;
  const options = { root, token: 'isolated-sound-test', execute: async job => {
    calls++;
    const saved = JSON.parse(await readFile(join(root, '.runtime/studio/jobs', job.id + '.json'), 'utf8'));
    assert.equal(saved.input.request.seed, job.input.request.seed);
    assert.equal(saved.sound_id, job.sound_id);
    job.budget_started_at ??= new Date().toISOString();
    return { outcome: 'needs_review' };
  } };
  let jobs = await openJobs(options);
  const input = { request: { prompt: 'A dry wooden knock', duration_seconds: 1 }, mode: 'manual', budget: { attempts: 2, minutes: 1 } };
  try {
    const first = await jobs.submit('first', input); await jobs.wait();
    const linked = { ...input, sound_parent_id: first.id };
    const second = await jobs.submit('second', linked); await jobs.wait();
    assert.equal(second.sound_id, first.id);
    assert.equal(second.parent_id, undefined);
    assert.equal(second.attempt, 1);
    assert.deepEqual(second.input.budget, input.budget);
    assert.notEqual(second.input.request.seed, first.input.request.seed);
    assert.equal((await jobs.submit('second', linked)).id, second.id);
    assert.equal(calls, 2);
    await assert.rejects(jobs.submit('second', input), /Idempotency key conflict/);
    await assert.rejects(jobs.submit('bad-reference', { ...input, sound_parent_id: 'f'.repeat(32) }), /Unknown sound parent/);
    await assert.rejects(jobs.submit('bad-reference', { ...input, sound_parent_id: '../jobs' }), /Invalid sound parent/);
    const unrelated = await jobs.submit('unrelated', input); await jobs.wait();
    assert.equal(unrelated.sound_id, unrelated.id);
    const explicit = await jobs.submit('reproduction', { ...linked, request: { ...input.request, seed: first.input.request.seed } }); await jobs.wait();
    assert.equal(explicit.input.request.seed, first.input.request.seed);
    const retry = await jobs.retry(second.id, 'retry'); await jobs.wait();
    assert.equal(retry.sound_id, first.id);
    assert.equal(retry.parent_id, second.id);
    assert.equal(retry.attempt, 2);
    assert.equal(retry.budget_started_at, second.budget_started_at);
    await jobs.close(); jobs = await openJobs(options);
    assert.equal(jobs.get(second.id).sound_id, first.id);
    assert.equal((await jobs.submit('second', linked)).id, second.id);
    assert.equal(calls, 5);
    const afterReload = await jobs.submit('after-reload', { ...input, sound_parent_id: retry.id }); await jobs.wait();
    assert.equal(afterReload.sound_id, first.id);
    assert.equal(afterReload.attempt, 1);
    assert.ok(![first, second, explicit, retry].some(job => job.input.request.seed === afterReload.input.request.seed));
  } finally { await jobs.close(); await rm(root, { recursive: true, force: true }); }
});
