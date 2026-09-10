// Prove recovery signals a live child despite its live session; only a fresh synthetic child is signaled.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { processIdentity } from '../../../../dist/ownership.js';
const root=await mkdtemp(resolve('.runtime/feedback-backend-'));
let child,backend;
try {
  await mkdir(join(root,'.runtime/sa3-gguf/build-metal/bin'),{recursive:true});
  await mkdir(join(root,'.runtime/studio/owners'),{recursive:true});
  await writeFile(join(root,'package.json'),'{"type":"module"}');
  await copyFile('dist/backend.js',join(root,'backend.mjs'));
  await writeFile(join(root,'config.js'),`export const root=${JSON.stringify(root)}; export const config={timeout_ms:10000}; export const sleep=ms=>new Promise(r=>setTimeout(r,ms)); export const validateRequest=()=>true;`);
  await writeFile(join(root,'ownership.js'),`export {processIdentity,stopOwned} from ${JSON.stringify(pathToFileURL(resolve('dist/ownership.js')).href)};`);
  await writeFile(join(root,'setup.mjs'),'export async function verifyGeneration() {}');
  await writeFile(join(root,'.runtime/sa3-gguf/build-metal/bin/sa3-smoke'),'#!/bin/sh\necho "GPU MTL0 Apple"\nsleep 0.2\n',{mode:0o700});
  child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  const identity=processIdentity(child.pid); assert.ok(identity);
  const liveOwner={pid:process.pid,identity:processIdentity(process.pid)};
  await writeFile(join(root,'.runtime/studio/owners/live.json'),JSON.stringify(liveOwner));
  await writeFile(join(root,'.runtime/backend-owner.json'),JSON.stringify({pid:child.pid,identity}));
  backend=new (await import(pathToFileURL(join(root,'backend.mjs')))).GgufBackend();
  await backend.start();
  assert.equal(child.signalCode,'SIGTERM');
  assert.equal(processIdentity(liveOwner.pid),liveOwner.identity);
  console.log(JSON.stringify({liveSessionStillAlive:true,syntheticBackendChildSignal:child.signalCode,startReturnedSuccessfully:true}));
} finally {await backend?.stop();if(child?.exitCode===null&&child?.signalCode===null)child.kill();await rm(root,{recursive:true,force:true});}
