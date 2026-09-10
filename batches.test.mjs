import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import test from 'node:test';
import { createStudio } from './studio.mjs';
import { hash } from './dist/config.js';
import { wavFixture } from './wav-fixture.mjs';
const input = { name: 'Synthetic agent batch', sounds: [{ key: 'bark', prompt: 'Synthetic bark', duration_seconds: 5 }, { key: 'hiss', prompt: 'Synthetic hiss', duration_seconds: 5 }] };
const plan = async intent => ({ version: 'prompt-plan-v2', intent, status: 'completed', error: null, model: 'fixture', instructions_sha256: 'a'.repeat(64), generation_prompts: [intent, ...Array.from({length:4}, (_,i) => `TrackType: SFX, ${intent} variation ${i+1}`)] });
const options = root => ({ root, port:0, computePort:0, token:'batch-fixture', fixture:true, setup:async()=>{}, preparePrompts:plan,
  backend:{ start:async()=>{}, stop:async()=>{}, reset:async()=>{}, unload:async()=>{}, generate:async request=>wavFixture(undefined,request.duration_seconds) } });
async function until(check) { const end=Date.now()+30000; while(Date.now()<end) { const value=await check(); if(value) return value; await new Promise(r=>setTimeout(r,50)); } throw new Error('Batch condition timed out'); }
if (process.argv[2] === '--crash') {
  const root=process.argv[3];
  const studio=await createStudio({...options(root), execute:async()=>{appendFileSync(join(root,'calls'),'1');process.exit(23);}});
  await studio.batches.submit('crash',input);
} else {
  test('agent submits once, reviews exact winners, edits and recreates in the same sound, then collects immutable files',async()=>{
    const root=await mkdtemp(resolve('.runtime/agent-batch-test-')); let count=0;
    const settings=options(root); settings.backend.generate=async request=>{count++;return wavFixture(undefined,request.duration_seconds);};
    let studio=await createStudio(settings);
    let origin=`http://127.0.0.1:${studio.server.address().port}`;
    const call=(path,value,key)=>fetch(origin+path,{method:value===undefined?'GET':'POST',headers:{Authorization:'Bearer batch-fixture','Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(value===undefined?{}:{body:JSON.stringify(value)})});
    try {
      assert.equal((await fetch(origin+'/studio/batches')).status,401);
      assert.equal((await call('/studio/batches',{...input,sounds:[input.sounds[0],input.sounds[0]]},'invalid')).status,400);
      const [a,b]=await Promise.all([call('/studio/batches',input,'one'),call('/studio/batches',input,'one')]);
      assert.equal(a.status,202); const batch=await a.json(); assert.equal((await b.json()).id,batch.id); assert.ok(batch.review_url.endsWith('/#batch/'+batch.id));
      assert.equal((await call('/studio/batches',{...input,name:'Conflict'},'one')).status,409);
      const base='/studio/batches/'+batch.id;
      assert.equal((await call(base+'/winners')).status,409);
      await call(base+'/pause',{}); await studio.jobs.wait(); const pausedCount=count;
      await studio.close(); studio=await createStudio(settings); origin=`http://127.0.0.1:${studio.server.address().port}`;
      await new Promise(r=>setTimeout(r,650)); assert.equal(count,pausedCount,'pause and accepted jobs survive restart');
      await call(base+'/resume',{});
      await until(()=>studio.batches.get(batch.id).status==='awaiting_review'); assert.equal(count,10);
      const state=studio.batches.get(batch.id);
      const first=studio.jobs.get(state.sounds[0].operations[0].job_id).variants[0].result.candidate_sha256;
      const second=studio.jobs.get(state.sounds[1].operations[0].job_id).variants[0].result.candidate_sha256;
      assert.equal((await call(base+'/sounds/bark/recreate',{candidate_sha256:second},'wrong-sound')).status,400);
      for (const [index,id] of [first,second].entries()) {
        const value={event_id:String(index+1).repeat(32),supersedes:null};
        assert.equal((await call(`/studio/candidates/${id}/select`,value)).status,200);
      }
      const manifest=await (await call(base+'/winners')).json(); assert.equal(manifest.sounds.length,2);
      for (const winner of manifest.sounds) { const audio=await call(new URL(winner.audio_url).pathname); assert.equal(hash(Buffer.from(await audio.arrayBuffer())),winner.audio_sha256); }
      const edited={prompt:'Edited synthetic bark',duration_seconds:10};
      assert.equal((await call(base+'/sounds/bark/regenerate',edited,'edit-once')).status,202);
      assert.equal((await call(base+'/sounds/bark/regenerate',edited,'edit-once')).status,202);
      assert.equal((await call(base+'/sounds/bark/regenerate',{...edited,prompt:'Other'},'edit-once')).status,409);
      assert.equal((await call(base+'/sounds/bark/recreate',{candidate_sha256:first},'cloud-once')).status,202);
      assert.equal((await call(base+'/winners')).status,409,'collection waits for queued changes');
      await until(()=>studio.batches.get(batch.id).status==='ready'); assert.equal(count,16);
      const changed=studio.batches.get(batch.id).sounds[0];
      assert.equal(changed.operations.length,3);
      for (const op of changed.operations) assert.equal(studio.jobs.get(op.job_id).sound_id,changed.sound_id);
      const paid=studio.jobs.get(changed.operations[2].job_id); assert.equal(paid.provider,'elevenlabs'); assert.equal(paid.attempts.length,1); assert.equal(paid.input.request.prompt,input.sounds[0].prompt);
      const replacement=paid.result.candidate_sha256;
      await call(`/studio/candidates/${replacement}/select`,{event_id:'3'.repeat(32),supersedes:'1'.repeat(32)});
      const newer=await (await call(base+'/winners')).json(); assert.notEqual(newer.revision,manifest.revision);
      assert.equal(hash(Buffer.from(await (await call(new URL(manifest.sounds[0].audio_url).pathname)).arrayBuffer())),manifest.sounds[0].audio_sha256,'previous manifest bytes stay available');
      await studio.close(); studio=await createStudio(settings); origin=`http://127.0.0.1:${studio.server.address().port}`;
      const reloaded = await (await call(base+'/winners')).json();
      assert.equal(reloaded.sounds[0].candidate_sha256,replacement); assert.equal(reloaded.revision,newer.revision,'manifest identity survives a changed server port');
      assert.equal((await call('/studio/batches',input,'one')).status,202); await new Promise(r=>setTimeout(r,650)); assert.equal(count,16);
    } finally {await studio.close();await rm(root,{recursive:true,force:true});}
  });
  test('hard restart blocks uncertain work without replay; acknowledgement releases remaining queue',async()=>{
    const root=await mkdtemp(resolve('.runtime/agent-batch-crash-'));
    const child=spawnSync(process.execPath,[resolve('batches.test.mjs'),'--crash',root],{timeout:15000,encoding:'utf8'});
    assert.equal(child.status,23,child.stderr+child.stdout);
    let calls=0;
    const studio=await createStudio({...options(root),execute:async()=>{calls++;return {outcome:'needs_review'};}});
    try {
      const batch=studio.batches.list()[0]; assert.equal(batch.status,'blocked');
      await new Promise(r=>setTimeout(r,650)); assert.equal(calls,0);
      assert.equal(await readFile(join(root,'calls'),'utf8'),'1');
      await studio.jobs.acknowledge(batch.sounds[0].operations[0].job_id);
      await until(()=>calls===5); assert.equal(studio.batches.get(batch.id).sounds[0].status,'needs_attention');
    } finally {await studio.close();await rm(root,{recursive:true,force:true});}
  });
}
