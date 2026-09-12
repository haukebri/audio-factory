// Run only against the owned scripts/studio-ui-fixture.mjs workspace.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync('.test-artifacts/studio-ui-session.json'));
assert.ok(manifest.root.includes('/.runtime/studio-ui-'));
const run=(...args)=>{const r=JSON.parse(execFileSync('agent-browser',['--session','create-check','--json',...args],{encoding:'utf8',timeout:60000}));assert.ok(r.success,r.error);return r.data};
const ev=code=>run('eval',code).result;
const wait=code=>run('wait','--fn',code);
const check=code=>assert.equal(ev(code),true,code);
try {
  const r=await fetch(manifest.url+'/studio/readiness',{headers:{Authorization:'Bearer isolated-ui-fixture'}});assert.equal((await r.json()).generation,'fixture');
  run('open',manifest.url);wait('Boolean(csrf)&&!busy');check('candidates.length>0&&candidates.every(c=>c.fixture)');
  ev(`(async()=>{await select(preferred(takes[0]).candidate_sha256);window.oldSound=takeFor(selected).sound;navigate('create');window.nativeFetch=fetch;window.fetch=async(input,init)=>{if(input==='/studio/jobs'&&init?.method==='POST')await new Promise(resolve=>window.releaseSubmit=resolve);return nativeFetch(input,init)};$('prompt').value='New standalone sound browser regression';})()`);
  run('find','role','button','click','--name','Generate 5 local takes','--exact');wait('Boolean(window.releaseSubmit)');
  check(`!$('generation-progress').hidden&&$('generation-stage').textContent.includes('Submitting')&&$('batch-results').children.length===0`);
  check(`$('generation-prompt').getClientRects().length>0&&$('generation-prompt').textContent.includes('New standalone sound')`);
  ev('releaseSubmit()');wait('!submitting&&Boolean(currentJob)&&!busy');
  ev('window.newJob=currentJob');
  check(`$('batch-results').dataset.sound!==oldSound&&$('batch-results').dataset.sound===(jobs.find(j=>j.id===newJob).sound_id??newJob)`);
  check(`!$('generation-progress').hidden&&$('generation-stage').textContent.length>0&&$('generation-detail').getClientRects().length>0&&$('generation-detail').textContent.includes('elapsed')`);
  ev(`(async()=>{await select(takes.find(t=>t.sound===oldSound).records[0].candidate_sha256);navigate('create');})()`);
  check(`currentJob===newJob&&view==='listen'&&$('batch-results').dataset.sound!==oldSound`);
  for(const width of [1280,375]){run('set','viewport',String(width),'900');check(`$('generation-detail').getClientRects().length>0`);copyFileSync(run('screenshot').path,`.test-artifacts/studio-create-${width}.png`)}
  run('set','viewport','1280','900');
  // Reload must keep the in-flight request even when storage contains an older selection.
  ev(`remember('selected',takes.find(t=>t.sound===oldSound).records[0].candidate_sha256)`);
  const reloadingJob = ev('currentJob');
  run('reload');wait('Boolean(csrf)&&!busy');
  check(`currentJob===${JSON.stringify(reloadingJob)}&&$('batch-results').dataset.sound===(jobs.find(j=>j.id===currentJob).sound_id??currentJob)&&$('generation-stage').textContent.length>0`);
  wait(`jobs.find(j=>j.id===currentJob)?.status==='completed'`);
  check(`!$('generation-progress').hidden&&$('generation-stage').textContent.includes('finished')&&$('batch-results').querySelectorAll('[data-clip]').length>0`);
  check(`[...$('sound-actions').querySelectorAll('button')].some(b=>b.textContent==='Generate more')`);
  // A fresh Create view clears history, but it remains available through History.
  ev(`navigate('create')`);check(`$('batch-results').children.length===0&&!$('empty').hidden&&$('generation-progress').hidden`);
  // Failure to refresh an accepted request must not claim submission failed.
  ev(`window.nativeFetch=fetch;window.accepted=false;window.fetch=async(input,init)=>{if(input==='/studio/jobs'&&init?.method==='POST'){const response=await nativeFetch(input,init);accepted=true;return response;}if(accepted&&input==='/studio/jobs')throw new Error('Fixture update unavailable');return nativeFetch(input,init)};$('prompt').value='Accepted request update regression'`);
  run('find','role','button','click','--name','Generate 5 local takes','--exact');wait('!busy&&!submitting');
  check(`Boolean(currentJob)&&$('generation-error').textContent.includes('Request saved')&&$('generation-stage').textContent!=='Request needs attention'&&$('batch-results').children.length>0`);
  ev('window.fetch=nativeFetch;refresh()');wait('!$("generation-error").textContent');
  wait(`jobs.find(j=>j.id===currentJob)?.status==='completed'`);ev("navigate('create')");
  // Rejected submission must keep meaningful feedback after the action's finally block.
  ev(`window.nativeFetch=fetch;window.fetch=(input,init)=>input==='/studio/jobs'&&init?.method==='POST'?Promise.resolve(new Response(JSON.stringify({error:'Fixture submission rejected'}),{status:400})):nativeFetch(input,init);$('prompt').value='Rejected standalone request'`);
  run('find','role','button','click','--name','Generate 5 local takes','--exact');wait('!busy&&!submitting');
  check(`!$('generation-progress').hidden&&$('generation-stage').textContent.length>0&&$('generation-error').textContent.includes('Fixture submission rejected')&&$('batch-results').children.length===0`);
  run('set','viewport','375','900');check(`$('generation-progress').getClientRects().length>0`);
  writeFileSync('.test-artifacts/studio-create-results.json',JSON.stringify({...manifest,passed:true},null,2));
  console.log('Standalone Create browser checks passed');
} finally {run('close')}
