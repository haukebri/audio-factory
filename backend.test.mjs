import assert from 'node:assert/strict';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { wavFixture } from './wav-fixture.mjs';

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
    backend = new GgufBackend();
    await assert.rejects(backend.generate(request, p => { if(p.status==='exporting') void backend.stop(); }), /canceled/);
    for (const mode of ['cancel', 'timeout']) {
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
