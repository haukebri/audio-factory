import assert from 'node:assert/strict';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { wavFixture } from './wav-fixture.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { runWorkflow } from './workflow.mjs';

test('checkout compute ownership protects custom-root workflows and setup, and recovers only abandoned children', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'audio-ownership-')));
  let backend, child, claim;
  try {
    for (const file of ['dist', 'setup.mjs', 'config.json', 'config.schema.json', 'request.schema.json', 'run.schema.json', 'package.json'])
      await cp(resolve(file), join(root, file), { recursive: true });
    await symlink(resolve('node_modules'), join(root, 'node_modules'));
    await mkdir(join(root, '.runtime/sa3-gguf/build-metal/bin'), { recursive: true });
    const { GgufBackend } = await import(pathToFileURL(join(root, 'dist/backend.js')));
    const { acquireCompute, processIdentity } = await import(pathToFileURL(join(root, 'dist/ownership.js')));
    const { ensureSetup } = await import(pathToFileURL(join(root, 'dist/setup.js')));
    claim = acquireCompute();
    child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    await once(child, 'spawn');
    const owner = { pid: child.pid, identity: processIdentity(child.pid), session: claim.owner };
    const ownerPath = join(root, '.runtime/backend-owner.json');
    await writeFile(ownerPath, JSON.stringify(owner));
    backend = new GgufBackend();
    await assert.rejects(backend.start(), /already owned/);
    await assert.rejects(runWorkflow({ id: 'custom', input: { request: {} } }, {
      root: join(root, 'custom-smoke'), token: 'fixture', backend, computePort: 0,
      signal: new AbortController().signal, setup: () => assert.fail('contender reached setup'),
    }), /already owned/);
    await assert.rejects(ensureSetup(true), /already owned/);
    const setup = spawnSync(process.execPath, ['setup.mjs'], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(setup.status, 0);
    assert.match(setup.stderr, /already owned/);
    assert.equal(processIdentity(child.pid), owner.identity);
    assert.equal(child.signalCode, null);
    assert.deepEqual(JSON.parse(await readFile(ownerPath)), owner);

    // Setup's child holds its own claim while borrowing only its parent's claim.
    const inherited = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { acquireCompute } from './dist/ownership.js';
      const claim = acquireCompute(process.env.AUDIO_FACTORY_COMPUTE_CLAIM);
      claim.release();
    `], { cwd: root, env: { ...process.env, AUDIO_FACTORY_COMPUTE_CLAIM: claim.name }, encoding: 'utf8', timeout: 10000 });
    assert.equal(inherited.status, 0, inherited.stderr);
    claim.release(); claim = undefined;

    // Even a missing lease cannot authorize killing a child with a live/unknown session.
    backend = new GgufBackend();
    await assert.rejects(backend.start(), /live or unknown/);
    await backend.stop();
    await assert.rejects(ensureSetup(true), /live or unknown/);
    await writeFile(ownerPath, JSON.stringify({ pid: owner.pid, identity: owner.identity }));
    await assert.rejects(backend.start(), /live or unknown/);
    await backend.stop();
    assert.equal(processIdentity(child.pid), owner.identity);

    await writeFile(join(root, 'setup.mjs'), 'export async function verifyGeneration() {}');
    await writeFile(join(root, '.runtime/sa3-gguf/build-metal/bin/sa3-smoke'), '#!/bin/sh\necho "GPU MTL0 Apple"\nsleep 0.1\n', { mode: 0o700 });
    const crashed = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { acquireCompute } from './dist/ownership.js';
      const { name, owner } = acquireCompute();
      console.log(JSON.stringify({ name, owner }));
      process.exit(0); // Simulate a session exiting without releasing its claim.
    `], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.equal(crashed.status, 0, crashed.stderr);
    const { name: staleClaim, owner: abandoned } = JSON.parse(crashed.stdout);
    assert.equal(processIdentity(abandoned.pid), undefined);
    await writeFile(ownerPath, JSON.stringify({ ...owner, identity: 'unrelated PID identity', session: abandoned }));
    await backend.start();
    assert.equal(processIdentity(child.pid), owner.identity);
    await backend.stop();
    await writeFile(ownerPath, JSON.stringify({ ...owner, session: abandoned }));
    const exited = once(child, 'exit');
    await backend.start();
    await exited;
    assert.equal(child.signalCode, 'SIGTERM');
    assert.equal(processIdentity(owner.pid), undefined);
    await backend.stop();

    // Cancellation must not release the checkout while setup is still draining.
    const controller = new AbortController();
    let finishSetup, setupStarted;
    const started = new Promise(resolve => { setupStarted = resolve; });
    const preparing = runWorkflow({ id: 'setup', input: { request: {} }, candidate_ids: [], provider: 'local' }, {
      root: join(root, 'custom-smoke'), token: 'fixture', backend: new GgufBackend(), computePort: 0,
      signal: controller.signal, store: { listCandidates: () => [] }, save: async () => {},
      setup: () => new Promise((_, reject) => { finishSetup = () => reject(new Error('canceled setup')); setupStarted(); }),
    });
    preparing.catch(() => {});
    await started;
    try {
      controller.abort();
      await assert.rejects(backend.start(), /already owned/);
    } finally { finishSetup(); }
    await assert.rejects(preparing, /canceled setup/);
    await backend.start();
    await backend.stop();
    assert.deepEqual(await readdir(join(root, '.runtime/compute-owners')), [staleClaim]);
  } finally {
    await backend?.stop(); claim?.release();
    if (child?.exitCode === null && child?.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await rm(root, { recursive: true, force: true });
  }
});

test('Medium subprocess uses exact components/settings, rejects fallback, and reaps cancellation/timeout', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'audio-gguf-')));
  let backend;
  try {
    for (const file of ['dist', 'config.json', 'config.schema.json', 'request.schema.json', 'run.schema.json', 'package.json'])
      await cp(resolve(file), join(root, file), { recursive: true });
    await symlink(resolve('node_modules'), join(root, 'node_modules'));
    await mkdir(join(root, 'out/work'), { recursive: true });
    await mkdir(join(root, '.runtime/sa3-gguf/build-metal/bin'), { recursive: true });
    await writeFile(join(root, 'fixture.wav'), wavFixture());
    await writeFile(join(root, '.runtime/sa3-gguf/build-metal/bin/sa3-generate'), `#!${process.execPath}
import {copyFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2), prompt=args[args.indexOf('--prompt')+1];
writeFileSync('../../args.json',JSON.stringify({args,env:process.env}));
if(prompt==='hang') { process.on('SIGTERM',()=>{}); console.log('waiting'); setInterval(()=>{},1000); }
else { copyFileSync('../../fixture.wav',args[args.indexOf('--out')+1]); console.log('[sa3] backend: '+(prompt==='cpu'?'CPU (Apple M4)':'MTL0 (Apple M4, 32 GB)')); }
`, { mode: 0o700 });
    const validate = new Ajv2020({strict:true}).compile(JSON.parse(await readFile(join(root,'config.schema.json'))));
    const selected = JSON.parse(await readFile(join(root,'config.json')));
    assert.ok(validate(selected));
    selected.models[2].file = selected.models[2].file.replace('F16','Q8_0');
    assert.equal(validate(selected),false);
    const { GgufBackend } = await import(pathToFileURL(join(root, 'dist/backend.js')));
    const { config } = await import(pathToFileURL(join(root, 'dist/config.js')));
    const { processIdentity } = await import(pathToFileURL(join(root, 'dist/ownership.js')));
    const request = { prompt: 'literal --same evil; $HOME', duration_seconds: 1, seed: 0 };
    backend = new GgufBackend();
    const previous = process.env.SA3_DEVICE;
    process.env.SA3_DEVICE = 'cpu';
    try { assert.ok((await backend.generate(request, () => {})).length > 44); }
    finally { if (previous === undefined) delete process.env.SA3_DEVICE; else process.env.SA3_DEVICE = previous; }
    const invocation = JSON.parse(await readFile(join(root, 'args.json')));
    assert.equal(invocation.env.SA3_DEVICE, 'metal');
    assert.equal(invocation.env.SA3_ENV_FILE, '/dev/null');
    for (const [flag, expected] of [['--same','stable-audio-3-medium-same-l-v1.0-F16.gguf'], ['--dit','stable-audio-3-medium-dit-1.5B-v1.0-F16.gguf'], ['--t5','t5gemma-b-b-ul2-encoder-0.3B-v1.0-F32.gguf']])
      assert.equal(resolve(invocation.args[invocation.args.indexOf(flag)+1]), join(root, '.runtime/sa3-gguf/models', expected));
    for (const [flag, value] of [['--prompt',request.prompt],['--seed','0'],['--duration','1'],['--steps','8'],['--duration-padding','0'],['--cfg-scale','1']])
      assert.equal(invocation.args[invocation.args.indexOf(flag)+1], value);
    await assert.rejects(backend.generate({...request,seed:-1},()=>{}), /resolved seed/);
    await assert.rejects(backend.generate({...request,prompt:'cpu'},()=>{}), /did not use Apple Metal/);
    // Cancel in the inference/export gap: no subsequent process may launch.
    await backend.stop();
    backend = new GgufBackend();
    await assert.rejects(backend.generate(request, p => { if(p.status==='exporting') void backend.stop(); }), /canceled/);
    for (const mode of ['cancel', 'timeout']) {
      await backend.stop();
      backend = new GgufBackend();
      config.timeout_ms = mode === 'timeout' ? 100 : 10000;
      const generation = backend.generate({...request,prompt:'hang'},()=>{});
      generation.catch(()=>{});
      const deadline = Date.now()+3000;
      while (!backend.child?.pid) { assert.ok(Date.now()<deadline); await new Promise(r=>setTimeout(r,10)); }
      const pid = backend.child.pid;
      const exit = once(backend.child, 'exit');
      if(mode==='cancel') await backend.stop();
      await assert.rejects(generation, mode==='timeout' ? /deadline exceeded/ : /Audio process failed/);
      await exit;
      assert.equal(processIdentity(pid), undefined);
      if (mode === 'cancel') { await backend.reset(); assert.equal(processIdentity(pid), undefined); }
    }
    await backend.stop();
    backend = new GgufBackend();
    await rm(join(root, '.runtime/sa3-gguf/build-metal/bin/sa3-generate'));
    await assert.rejects(backend.generate(request,()=>{}), /ENOENT/);
  } finally { await backend?.stop(); await rm(root, { recursive: true, force: true }); }
});

test('pinned downloads resume partials, reuse complete bytes and preserve mismatches', async () => {
  const { spawnSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const root = await mkdtemp(join(tmpdir(), 'audio-download-'));
  try {
    await cp(resolve('download_models.py'), join(root, 'download_models.py'));
    await mkdir(join(root, 'bin'));
    const models = join(root, '.runtime/sa3-gguf/models');
    await mkdir(models, { recursive: true });
    const bytes = Buffer.from('controlled model bytes');
    await writeFile(join(root,'expected'),bytes);
    await writeFile(join(root,'config.json'),JSON.stringify({models:[{file:'component.gguf',url:'https://fixture.invalid/model',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]}));
    await writeFile(join(root,'bin/curl'),`#!${process.execPath}
const fs=require('node:fs'),a=process.argv.slice(2);
if(a[a.indexOf('--continue-at')+1]!=='-')process.exit(2);
const out=a[a.indexOf('--output')+1],bytes=fs.readFileSync('expected');
const offset=fs.existsSync(out)?fs.statSync(out).size:0;
fs.appendFileSync(out,bytes.subarray(offset));fs.appendFileSync('downloads','called\\n');
`,{mode:0o700});
    await writeFile(join(models,'component.gguf.partial'),bytes.subarray(0,4));
    const run=()=>spawnSync('python3',['download_models.py'],{cwd:root,env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH},encoding:'utf8',timeout:10000});
    let r=run();assert.equal(r.status,0,r.stderr);assert.deepEqual(await readFile(join(models,'component.gguf')),bytes);
    r=run();assert.equal(r.status,0,r.stderr);assert.equal(await readFile(join(root,'downloads'),'utf8'),'called\n');
    await writeFile(join(models,'component.gguf'),'wrong');r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/Model mismatch/);assert.equal(await readFile(join(models,'component.gguf'),'utf8'),'wrong');
    await rm(join(models,'component.gguf'));await writeFile(join(models,'component.gguf.partial'),'BAD!');
    r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/Model mismatch/);assert.equal((await readFile(join(models,'component.gguf.partial'))).subarray(0,4).toString(),'BAD!');
  } finally { await rm(root,{recursive:true,force:true}); }
});
