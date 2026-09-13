// Start scripts/studio-ui-fixture.mjs with an absolute owned root, port 0 and --waveform.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('.test-artifacts/studio-ui-session.json'));
assert.ok(manifest.root.includes('/.runtime/studio-ui-'));
const run = (...args) => {
  const result = JSON.parse(execFileSync('agent-browser', ['--session', 'waveform-check', '--json', ...args], { encoding: 'utf8', timeout: 60000 }));
  assert.ok(result.success, result.error); return result.data;
};
const evaluate = code => run('eval', code).result;
const wait = code => run('wait', '--fn', code);
const check = (code, expected = true) => assert.deepEqual(evaluate(code), expected, code);
const open = () => {
  evaluate(`(() => { closeEditor(); const row = document.querySelector('#batch-results [data-take]'); trim(candidates.find(c => c.candidate_sha256 === row.dataset.clip), row); window.editor = document.querySelector('.trim-editor'); window.player = editor.playback; window.play = editor.querySelector('.actions button'); })()`);
};
const ready = () => wait('!play.disabled');
const key = (name, key) => evaluate(`document.getElementById('cut-${name}').dispatchEvent(new KeyboardEvent('keydown', {key:${JSON.stringify(key)}, bubbles:true}))`);
let socket, sequence = 0;
const pending = new Map();
const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id=++sequence; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params,sessionId})); });
const bound = name => `Number(document.getElementById('cut-${name}').getAttribute('aria-valuenow'))`;
try {
  const readiness = await fetch(manifest.url + '/studio/readiness', { headers: { Authorization: 'Bearer isolated-ui-fixture' } });
  assert.equal((await readiness.json()).generation, 'fixture');
  run('open', manifest.url); wait('Boolean(csrf) && !busy');
  check('candidates.length > 0 && candidates.every(c => c.fixture)');
  evaluate(`(async () => { await select(preferred(takes[0]).candidate_sha256); navigate('listen'); await useTake(preferred(takes[0])); window.sourceFetches = 0; window.posts = []; window.frames=new Set();window.raf=requestAnimationFrame;window.caf=cancelAnimationFrame;window.requestAnimationFrame=callback=>{const id=raf(time=>{frames.delete(id);callback(time)});frames.add(id);return id};window.cancelAnimationFrame=id=>{frames.delete(id);caf(id)}; window.realFetch = fetch; window.fetch = (input, init) => { if (String(input).endsWith('/source')) sourceFetches++; if (init?.method === 'POST') posts.push({url: input, body: JSON.parse(init.body)}); return realFetch(input, init); }; })()`);
  evaluate(`window.playedBuffers=[];window.createAudioBuffer=AudioContext.prototype.createBuffer;AudioContext.prototype.createBuffer=function(...args){const buffer=createAudioBuffer.apply(this,args);playedBuffers.push(buffer);return buffer;}`);
  open(); ready();
  evaluate(`window.sourceID = editor.dataset.editor`);
  // Pixel evidence uses the actual canvas and known stereo PCM fixture, not markup assertions.
  check(`(() => { const c = editor.querySelector('canvas'),ctx=c.getContext('2d'); const ink = t => { const x=Math.floor(t/3*c.width); const p=ctx.getImageData(x,0,1,c.height).data; let n=0; for(let i=3;i<p.length;i+=4) if(p[i]) n++; return n; }; return ink(.15) === 0 && ink(1.5) > ink(.9)*5 && ink(.5)>ink(.9)*7 && ink(.75)>ink(.9)*7; })()`);
  key('start', 'Home'); key('end', 'End'); run('focus','#cut-start'); run('press','ArrowRight'); check(bound('start'), .01);
  check(`document.activeElement.id==='cut-start' && getComputedStyle(document.activeElement).outlineStyle==='solid'`);
  run('find','role','button','click','--name','▶ Play','--exact'); wait('!player.paused && player.currentTime > .1');
  check(`(async()=>{player.pause();play.click();await new Promise(r=>setTimeout(r,150));return !player.paused;})()`);
  wait(`Math.abs(parseFloat(editor.querySelector('.trim-playhead').style.left)/100*3-player.currentTime)<.08`);
  evaluate('play.click()'); wait('player.paused'); check('play.textContent', '▶ Play');
  const paused = evaluate('player.currentTime');
  evaluate('play.click()'); wait(`player.currentTime > ${paused + .1}`);
  evaluate(`window.beforeLevelTime=player.currentTime;window.beforeBuffers=playedBuffers.length;$('cut-gain').value='-6';$('cut-gain').dispatchEvent(new Event('input'))`);
  wait('playedBuffers.length>beforeBuffers');
  check('!player.paused && player.currentTime>=beforeLevelTime');
  check(`Math.abs(playedBuffers.at(-1).getChannelData(0).reduce((peak,value)=>Math.max(peak,Math.abs(value)),0)-10**(-9/20))<.0001`);
  run('focus','#cut-gain');run('press','ArrowRight');check(`$('cut-gain').value`,'-5.5');
  evaluate(`[...editor.querySelectorAll('button')].find(b=>b.textContent==='Reset level').click()`);check(`$('cut-gain').value`,'0');
  key('start', 'ArrowRight'); check('player.paused'); check('player.currentTime', .02);
  // Real mouse pointer capture, with refresh while the gesture is active.
  evaluate('play.click()');wait('!player.paused');
  evaluate('editor.querySelector(".trim-waveform").scrollIntoView({block:"center"})');
  const rect = evaluate(`(() => { const r=$('cut-start').getBoundingClientRect(),t=editor.querySelector('.trim-timeline').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,width:t.width}; })()`);
  run('mouse','move',String(Math.round(rect.x)),String(Math.round(rect.y))); run('mouse','down');
  evaluate('(async()=>{await refresh(); return editor===document.querySelector(".trim-editor")})()');
  run('mouse','move',String(Math.round(rect.x+rect.width/3)),String(Math.round(rect.y))); run('mouse','up');
  check(bound('start'),1.02); check('player.currentTime',1.02); check('player.paused');
  // Clamp both ends through the same keyboard path, then reset.
  key('start','End'); check(`Math.abs(${bound('end')}-${bound('start')}-.01)<1e-9`);
  key('end','Home'); check(`Math.abs(${bound('end')}-${bound('start')}-.01)<1e-9`);
  key('start','Home'); key('end','End');
  // Native Chromium touch input exercises pointer capture and overlapping grips.
  socket = new WebSocket(run('get','cdp-url').cdpUrl);
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});
  const targets=await cdp('Target.getTargets');
  const target=targets.targetInfos.find(t=>t.type==='page'&&t.url.startsWith(manifest.url));
  const {sessionId}=await cdp('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true},sessionId);
  run('set','viewport','375','900'); key('start','End');
  evaluate("editor.querySelector('.trim-waveform').scrollIntoView({block:'center'})");
  const grip=name=>evaluate(`(()=>{const r=$('cut-${name}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const touch=async(type,point)=>cdp('Input.dispatchTouchEvent',{type,touchPoints:point?[{...point,id:1}]:[]},sessionId);
  const startGrip=grip('start');
  await touch('touchStart',startGrip); await touch('touchMove',{x:startGrip.x-70,y:startGrip.y}); await touch('touchCancel');
  check(`${bound('start')}<2.99 && player.paused && Math.abs(player.currentTime-${bound('start')})<.001`);
  const endGrip=grip('end');
  await touch('touchStart',endGrip); await touch('touchMove',{x:0,y:endGrip.y}); await touch('touchEnd');
  check(`Math.abs(${bound('end')}-${bound('start')}-.01)<1e-9`);
  const narrowShot=await cdp('Page.captureScreenshot',{format:'png'},sessionId);
  writeFileSync('.test-artifacts/waveform-trim-narrow.png',Buffer.from(narrowShot.data,'base64'));
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:false},sessionId);
  key('start','Home'); key('end','End'); run('set','viewport','1280','900');
  // Seek inside/outside selection, paused and playing.
  key('start','ArrowRight');
  evaluate(`window.seek = fraction => { const t=editor.querySelector('.trim-timeline'),r=t.getBoundingClientRect(); t.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+fraction*r.width,button:0,bubbles:true})); }; seek(.5)`);
  check('player.paused && Math.abs(player.currentTime-1.5)<.01');
  evaluate('play.click()'); wait('!player.paused'); evaluate('seek(.7)'); wait('!player.paused && player.currentTime>=2.09');
  evaluate('seek(1.2)'); wait('player.paused'); check('player.currentTime',3);
  evaluate('play.click()'); wait('!player.paused && player.currentTime < 1');
  check(`(async()=>{const p=player,e=editor;await refresh();return p===document.querySelector('.trim-editor').playback&&e===document.querySelector('.trim-editor')&&!p.paused;})()`);
  check('sourceFetches',1);
  for (const width of [375,1280]) {
    run('set','viewport',String(width),'900');
    check(bound('start'),.01); check(bound('end'),3);
    evaluate('editor.querySelector(".trim-waveform").scrollIntoView({block:"center"})');
    const shot=await cdp('Page.captureScreenshot',{format:'png'},sessionId);
    writeFileSync(`.test-artifacts/waveform-trim-${width}.png`,Buffer.from(shot.data,'base64'));
  }
  wait('player.paused && player.currentTime===3'); check('play.textContent','▶ Play');
  // Other player and processed audition enforce exclusive playback.
  evaluate(`(async()=>{play.click(); await new Promise(r=>player.addEventListener('playing',r,{once:true})); window.other=editor.parentElement.querySelector('audio'); await other.play();})()`); check('player.paused');
  evaluate(`$('cut-loop').checked=true; $('cut-loop').dispatchEvent(new Event('change')); window.loopButton=[...editor.querySelectorAll('button')].find(b=>b.textContent==='Preview loop');loopButton.click()`);
  wait('Boolean(loopPlayer) && !loopPlayer.paused'); check('player.paused && other.paused');
  evaluate(`window.beforeBuffers=playedBuffers.length;$('cut-gain').value='12';$('cut-gain').dispatchEvent(new Event('input'))`);
  wait('playedBuffers.length>beforeBuffers');check('!loopPlayer.paused');
  check(`playedBuffers.at(-1).getChannelData(0).every(value=>Math.abs(value)<=10**(-.1/20)+1/32768)`);
  const loopCursor=evaluate("editor.querySelector('.trim-playhead').style.left");
  check('!loopPlayer.paused'); evaluate('loopButton.click()'); check('!loopPlayer');
  check("editor.querySelector('.trim-playhead').style.left",loopCursor);
  evaluate('loopButton.click()'); wait('Boolean(loopPlayer) && !loopPlayer.paused'); evaluate('play.click()'); wait('!player.paused'); check('!loopPlayer');
  evaluate('loopButton.click()'); wait('Boolean(loopPlayer) && !loopPlayer.paused'); key('end','ArrowLeft'); check('!loopPlayer && player.paused');
  evaluate(`$('cut-gain').value='12';$('cut-gain').dispatchEvent(new Event('input'))`);
  // Save once, preserve exact bounds, and select the new main track; exact export remains available.
  evaluate(`$('cut-loop').checked=false; $('cut-loop').dispatchEvent(new Event('change')); window.beforeCount=candidates.length;window.winners=JSON.stringify(selections);window.savedBounds=[${bound('start')},${bound('end')}];[...editor.querySelectorAll('button')].find(b=>b.textContent==='Save trim').click()`);
  wait('!busy && candidates.length===beforeCount+1 && document.querySelector(".trim-editor")?.dataset.editor!==sourceID');
  check(`selections.some(s=>s.candidate_sha256===document.querySelector('.trim-editor').dataset.editor)`);
  check(`document.querySelector('[data-best] [data-clip]').dataset.clip===document.querySelector('.trim-editor').dataset.editor`);
  check(`$('cut-gain').value`,'12');
  check(`candidates.find(c=>c.candidate_sha256===document.querySelector('.trim-editor').dataset.editor).evidence.cut.normalization.adjustment_db`,12);
  check(`posts.filter(p=>String(p.url).endsWith('/cut')).length`,1);
  check(`posts.find(p=>String(p.url).endsWith('/cut')).body.start_seconds`,.01);
  check(`posts.find(p=>String(p.url).endsWith('/cut')).body.end_seconds`,2.99);
  check(`${bound('start')}===.01 && ${bound('end')}===2.99`);
  check(`(async()=>{const id=document.querySelector('.trim-editor').dataset.editor; const r=await realFetch('/studio/candidates/'+id+'/export'); return r.ok&&(await r.blob()).size>0;})()`);
  // Saving a processed loop selects that exact immutable loop.
  evaluate(`window.editor=document.querySelector('.trim-editor');window.player=editor.playback;window.play=editor.querySelector('.actions button');$('cut-loop').checked=true;$('cut-loop').dispatchEvent(new Event('change'));window.beforeLoop=candidates.length;[...editor.querySelectorAll('button')].find(b=>b.textContent==='Save loop').click()`);
  wait('!busy && candidates.length===beforeLoop+1');
  check(`selections.some(s=>s.candidate_sha256===document.querySelector('.trim-editor').dataset.editor) && posts.filter(p=>String(p.url).endsWith('/cut')).at(-1).body.loop===true`);
  check(`candidates.find(c=>c.candidate_sha256===document.querySelector('.trim-editor').dataset.editor).evidence.cut.loop.output_frames>0`);
  // Reopening an exact sample boundary must not quantize it to the display's hundredths.
  evaluate(`(async()=>{const result=await api('candidates/'+sourceID+'/cut',{start_seconds:1234/44100,end_seconds:100003/44100,loop:false});await refresh();closeEditor();const row=document.querySelector('#batch-results [data-take]'),saved=candidates.find(c=>c.candidate_sha256===result.candidate_sha256);row.replaceChildren();renderClip(saved,row);trim(saved,row);window.editor=document.querySelector('.trim-editor');window.player=editor.playback;window.play=editor.querySelector('.actions button');})()`);
  ready();check(`${bound('start')}===1234/44100 && ${bound('end')}===100003/44100`);
  evaluate(`window.exactID=editor.dataset.editor;[...editor.querySelectorAll('button')].find(b=>b.textContent==='Save trim').click()`);
  wait('!busy && document.querySelector(".trim-editor").dataset.editor!==exactID');
  check(`posts.filter(p=>p.url.endsWith('/cut')).at(-1).body.start_seconds===1234/44100 && posts.filter(p=>p.url.endsWith('/cut')).at(-1).body.end_seconds===100003/44100`);
  // Failed source loading/decode, retry, rejected play, and closing during pending load.
  evaluate(`closeEditor(); window.fetch=(input,init)=>String(input).endsWith('/source')?Promise.resolve(new Response('broken',{status:200})):realFetch(input,init)`);
  open(); wait('!editor.querySelector("button:nth-of-type(1)") || [...editor.querySelectorAll("button")].some(b=>b.textContent==="Retry audio"&&!b.hidden)');
  check('play.disabled'); check('!editor.querySelector("button[data-pending-key]").disabled');
  const retained=evaluate(`[${bound('start')},${bound('end')}]`);
  evaluate(`window.fetch=realFetch; [...editor.querySelectorAll('button')].find(b=>b.textContent==='Retry audio').click()`); ready();
  check(`[${bound('start')},${bound('end')}]`,retained);
  evaluate(`window.realPlay=player.play; player.play=()=>Promise.reject(new Error('test rejection'));play.click()`);
  wait('editor.innerText.includes("test rejection")'); check('player.paused && play.textContent==="▶ Play"');
  evaluate('player.play=realPlay;play.click()');wait('!player.paused');
  // A media-element network failure is separate from failure to decode the waveform.
  await cdp('Network.enable',{},sessionId);
  const mediaURL=evaluate(`location.origin+'/studio/candidates/'+takes.at(-1).records.at(-1).candidate_sha256+'/source'`);
  await cdp('Network.setBlockedURLs',{urls:[mediaURL]},sessionId);
  evaluate(`player.src=${JSON.stringify(mediaURL)};player.load()`);
  wait('Boolean(player.error)');check('player.paused && play.disabled && frames.size===0');
  await cdp('Network.setBlockedURLs',{urls:[]},sessionId);
  evaluate(`[...editor.querySelectorAll('button')].find(b=>b.textContent==='Retry audio').click()`);ready();
  evaluate('play.click()');wait('!player.paused');evaluate('closeEditor()');check('player.paused && frames.size===0');
  evaluate(`window.fetch=(input,init)=>String(input).endsWith('/source')?new Promise(resolve=>{window.releaseSource=()=>resolve(realFetch(input));}):realFetch(input,init)`);
  open();wait('Boolean(window.releaseSource)');evaluate(`$('cut-loop').checked=true;$('cut-loop').dispatchEvent(new Event('change'));[...editor.querySelectorAll('button')].find(b=>b.textContent==='Preview loop').click()`);
  evaluate('closeEditor();releaseSource()');
  await cdp('Runtime.evaluate',{expression:'new Promise(r=>setTimeout(r,200))',awaitPromise:true},sessionId);
  check('player.paused && !loopPlayer && frames.size===0 && !document.querySelector(".trim-editor")');
  writeFileSync('.test-artifacts/waveform-trim-results.json',JSON.stringify({ ...manifest, source_candidate:evaluate('sourceID'), passed:true, checks:'waveform stereo peaks/silence, keyboard/mouse/touch/cancellation, seek/play/pause/end, refresh/cache/resize, exclusivity/loop, immutable trim/loop save/export and exact sample bounds, decode/media retry/play rejection/closure and animation cleanup' },null,2));
  console.log('Waveform browser checks passed');
} catch(error) {
  writeFileSync('.test-artifacts/waveform-trim-failure.json',JSON.stringify({error:error.message,state:evaluate(`({text:editor.innerText,paused:player.paused,time:player.currentTime,error:player.error?.message,ready:player.readyState,src:player.src,frames:frames.size})`)},null,2));throw error;
} finally { socket?.close(); run('close'); }
