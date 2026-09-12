import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import test from 'node:test';
import { config, hash, root } from './dist/config.js';
import { wavFixture } from './wav-fixture.mjs';

const execute = promisify(execFile);
test('launcher repairs failed signal sync and skips sync once imports work', async () => {
  const directory = await mkdtemp(resolve(root, '.runtime/setup-test-'));
  const uv = (await execute('which', ['uv'])).stdout.trim();
  const env = { ...process.env, PATH: `${directory}/bin:${process.env.PATH}`, NODE_OPTIONS: '', NODE_PATH: '' };
  const run = (...args) => execute(`${directory}/run`, args, { env, timeout: 120000 });
  try {
    for (const name of ['run', 'src', 'dist', 'tsconfig.json', 'package.json', 'config.json',
      'qa-config.json', 'qa.py', 'bundle.mjs', 'loop-audio.mjs', 'export-lineage.mjs', 'signal-requirements.lock',
      ...(await readdir(root)).filter(name => name.endsWith('.schema.json'))]) {
      await cp(`${root}/${name}`, `${directory}/${name}`, { recursive: true });
    }
    await symlink(`${root}/node_modules`, `${directory}/node_modules`, 'dir');
    await mkdir(`${directory}/bin`);
    await mkdir(`${directory}/.runtime/sa3-gguf/models`, { recursive: true });
    await mkdir(`${directory}/.runtime/sa3-gguf/build-metal/bin`, { recursive: true });
    for (const model of config.models) await writeFile(`${directory}/.runtime/sa3-gguf/models/${model.file}`, 'fixture');
    await writeFile(`${directory}/.runtime/sa3-gguf/build-manifest.json`, '{}');
    // Only generation verification/device discovery is synthetic; signal setup and QA are real.
    await writeFile(`${directory}/setup.mjs`, 'export async function verifyGeneration() {}\n');
    await writeFile(`${directory}/.runtime/sa3-gguf/build-metal/bin/sa3-smoke`,
      '#!/bin/sh\nsleep 0.2\necho "GPU MTL0 Apple fixture"\n', { mode: 0o700 });
    await execute(uv, ['venv', '--python', '3.11.15', `${directory}/.runtime/signal-venv`]);
    const python = `${directory}/.runtime/signal-venv/bin/python`;
    await assert.rejects(execute(python, ['-c', 'import numpy, soundfile']));
    await writeFile(`${directory}/bin/uv`, `#!/usr/bin/env node
import { appendFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
appendFileSync(${JSON.stringify(`${directory}/uv-calls`)}, JSON.stringify(process.argv.slice(2)) + '\\n');
if (existsSync(${JSON.stringify(`${directory}/fail-sync`)})) { console.error('injected sync failure'); process.exit(1); }
const result = spawnSync(${JSON.stringify(uv)}, process.argv.slice(2), { stdio: 'inherit' });
process.exit(result.status ?? 1);
`, { mode: 0o700 });
    const id = '7'.repeat(32);
    const source = wavFixture(t => t > .2 && t < .8);
    const runPath = `${directory}/out/runs/${id}`;
    await mkdir(runPath, { recursive: true });
    const evidence = JSON.stringify({ status: 'completed', audio_sha256: hash(source) });
    await writeFile(`${runPath}/run.json`, evidence);
    await writeFile(`${runPath}/audio.wav`, source);
    await writeFile(`${directory}/fail-sync`, 'fail until explicitly repaired');
    await assert.rejects(run('setup'), /Setup failed/);
    await assert.rejects(execute(python, ['-c', 'import numpy, soundfile']));
    const failedLog = await readFile(`${directory}/.runtime/setup.log`, 'utf8');
    assert.match(failedLog, /injected sync failure/);
    await rm(`${directory}/fail-sync`);
    assert.equal(JSON.parse((await run('setup')).stdout).status, 'ready');
    await execute(python, ['-c', 'import numpy, soundfile']);
    assert.ok((await readFile(`${directory}/.runtime/setup.log`, 'utf8')).startsWith(failedLog));
    const calls = await readFile(`${directory}/uv-calls`, 'utf8');
    assert.equal(calls.trim().split('\n').length, 2);
    for (const call of calls.trim().split('\n')) assert.deepEqual(JSON.parse(call).map(arg => arg.startsWith('/') ? resolve(arg) : arg),
      ['pip', 'sync', '--python', python, `${directory}/signal-requirements.lock`]);
    // A valid environment must work even when any further uv invocation would fail.
    await writeFile(`${directory}/fail-sync`, 'no unnecessary sync');
    assert.equal(JSON.parse((await run('setup')).stdout).status, 'ready');
    const analysis = JSON.parse((await run('analyze', id)).stdout);
    const report = JSON.parse(await readFile(analysis.report, 'utf8'));
    assert.equal(report.status, 'completed');
    assert.equal(report.result.audio_sha256, hash(source));
    assert.equal(report.result.regions.length, 1);
    assert.equal(await readFile(`${directory}/uv-calls`, 'utf8'), calls);
    assert.equal(await readFile(`${runPath}/run.json`, 'utf8'), evidence);
    assert.deepEqual(await readFile(`${runPath}/audio.wav`), source);
    assert.deepEqual(await readdir(`${directory}/.runtime/compute-owners`), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
    console.log(`Removed setup fixture: ${directory}`);
  }
});
