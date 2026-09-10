// Synthetic review diagnostics; no model/API calls. Run: node docs/tasks/feedback-1/code-review/reproduce.mjs
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createFactory } from '../../../../dist/service.js';
import { config, hash } from '../../../../dist/config.js';
import { openReviewStore } from '../../../../review-store.mjs';
import { qaOperation } from '../../../../dist/qa.js';
import { wavFixture } from '../../../../wav-fixture.mjs';
const repository = resolve('.');
const root = await mkdtemp(join(repository, '.runtime/feedback-code-'));
const results = {};
let factory;
try {
  // The unchanged setup implementation uses interpreter existence as readiness.
  const setupRoot = join(root, 'setup');
  await mkdir(join(setupRoot, '.runtime/signal-venv/bin'), {recursive:true});
  await copyFile('dist/setup.js', join(setupRoot, 'setup.mjs'));
  await writeFile(join(setupRoot, 'package.json'), '{"type":"module"}');
  await writeFile(join(setupRoot, 'config.js'), `export const root=${JSON.stringify(setupRoot)}; export const config={};`);
  await writeFile(join(setupRoot, '.runtime/signal-venv/bin/python'), '#!/bin/sh\nexit 1\n', {mode:0o700});
  await (await import(pathToFileURL(join(setupRoot, 'setup.mjs')))).ensureSetup(false);
  results.setup = 'ensureSetup(false) returned success with an unusable existing interpreter and no dependencies';
  const source = wavFixture(t => t > .1 && t < .8, 1);
  factory = await createFactory({root, token:'review-fixture', backend:{async generate(){return source;},async reset(){},async unload(){}}});
  await new Promise(resolve => factory.server.listen(0,'127.0.0.1',resolve));
  const response = await fetch(`http://127.0.0.1:${factory.server.address().port}/v1/sound-effects`,{method:'POST',headers:{Authorization:'Bearer review-fixture','Content-Type':'application/json','Idempotency-Key':'review'},body:JSON.stringify({prompt:'Synthetic tone',duration_seconds:1})});
  assert.equal(response.status,200); await response.arrayBuffer();
  const runId = hash('review').slice(0,32);
  const generation = JSON.parse(await readFile(join(root,'out/runs',runId,'run.json')));
  const cut = await qaOperation(root,runId,'cuts',{start_seconds:.2,end_seconds:.7});
  assert.equal(cut.status,'completed',cut.error);
  const evidence = JSON.parse(await readFile(cut.delivery.metadata));
  const store = openReviewStore(join(root,'.runtime/studio'));
  const c = store.saveCandidate({attempt_id:runId,fixture:true,evidence,evaluation:null},source,await readFile(cut.delivery.audio));
  // Copy only the retention entrypoint: its local imports point at the real reviewed store/verifier;
  // its output root remains isolated so diagnostics never add to the user's retained assets.
  const retain = (await readFile('retain.mjs','utf8')).replace('"./export-lineage.mjs"',JSON.stringify(pathToFileURL(join(repository,'export-lineage.mjs')).href)).replace("'./review-store.mjs'",JSON.stringify(pathToFileURL(join(repository,'review-store.mjs')).href));
  await writeFile(join(root,'retain.mjs'),retain);
  const retained = JSON.parse(execFileSync(process.execPath,[join(root,'retain.mjs'),join(root,'.runtime/studio/candidates',c.candidate_sha256,'source.wav')],{encoding:'utf8'}));
  const retainedBytes=await readFile(retained.audio);
  assert.equal(hash(retainedBytes),generation.audio_sha256);
  assert.notEqual(hash(retainedBytes),evidence.cut.audio_sha256);
  results.retain = {returnedAudioMatchesSource:true,returnedAudioMatchesCandidateCut:false,candidateHasCut:true};
  // Quantify repeated synchronous validation on a modest five-second library.
  const perfStore = openReviewStore(join(root,'performance'));
  const bytes = wavFixture(()=>true,5);
  for(let i=0;i<100;i++) {
    const id=hash(`perf-${i}`).slice(0,32);
    perfStore.saveCandidate({attempt_id:id,fixture:true,evaluation:null,evidence:{generation:{...generation,id,request:{...generation.request,duration_seconds:5},audio:{...generation.audio,seconds:5,bytes:bytes.length},audio_path:`out/runs/${id}/audio.wav`,audio_sha256:hash(bytes)},analyses:[],cut_failure:null,reason:'Synthetic performance fixture'}},bytes);
  }
  const timings=[];
  for(let i=0;i<3;i++){const start=performance.now();assert.equal(perfStore.listCandidates().length,100);timings.push(Math.round(performance.now()-start));}
  results.polling={candidates:100,sourceBytesPerList:100*bytes.length,synchronousListMilliseconds:timings};
  console.log(JSON.stringify(results,null,2));
} finally {await factory?.close();await rm(root,{recursive:true,force:true});}
