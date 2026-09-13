import { test } from 'node:test';
import { get } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bounds, convert, probe, run, videoURL } from './audio.mjs';
import { startServer } from './server.mjs';

async function waitFor(job, request) {
  const deadline = Date.now() + 15000;
  while (job.status === 'running' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
    job = await request(`jobs/${job.id}`);
  }
  assert.equal(job.status, 'completed', job.error); return job;
}

test('URL boundaries, exact audio cuts, local HTTP workflow and recovery', async () => {
  assert.equal(videoURL('https://youtu.be/--8D5cfAHvY?t=5'), 'https://www.youtube.com/watch?v=--8D5cfAHvY');
  for (const url of ['file:///etc/passwd','https://youtube.com.evil.test/watch?v=--8D5cfAHvY','https://youtube.com/watch?v=--8D5cfAHvY&list=x','https://user@youtube.com/watch?v=--8D5cfAHvY','http://youtube.com/watch?v=--8D5cfAHvY','https://youtu.be/--8D5cfAHvY/path']) assert.throws(() => videoURL(url));
  for (const input of [{start:-1,end:1},{start:0,end:61},{start:2,end:1},{start:'0',end:1},{start:0,end:1,gain:13},{start:0,end:Infinity}]) assert.throws(() => bounds(input));
  const root = await mkdtemp(join(tmpdir(), 'youtube-poc-test-'));
  let app;
  try {
    // A known 3-second source: silence, then 440 Hz, then 880 Hz; exposes wrong seek offsets.
    const source = join(root, 'marker.wav');
    await run('ffmpeg', ['-v','error','-f','lavfi','-i',"aevalsrc=if(lt(t\\,1)\\,0\\,if(lt(t\\,2)\\,0.2*sin(2*PI*440*t)\\,0.2*sin(2*PI*880*t))):s=44100:d=3", '-c:a','pcm_s16le',source]);
    const cut = join(root, 'cut.wav');
    assert.equal(await convert(source, cut, {start:1.25,end:1.75}), .5);
    const wave = await readFile(cut); assert.equal(wave.length, 44 + 22050 * 4);
    let positiveCrossings = 0, peak = 0;
    for (let i=44;i<wave.length;i+=4) {
      const value=wave.readInt16LE(i); assert.equal(value,wave.readInt16LE(i+2)); peak=Math.max(peak,Math.abs(value));
      if(i>44 && wave.readInt16LE(i-4)<=0 && value>0) positiveCrossings++;
    }
    assert.ok(Math.abs(positiveCrossings-220)<=1, `${positiveCrossings} crossings`);
    assert.ok(Math.abs(20*Math.log10(peak/32767)+3)<.01);
    assert.equal((await probe(cut)).streams[0].codec_name,'pcm_s16le');
    await assert.rejects(convert(source,join(root,'bad.wav'),{start:2,end:4}));
    const controller = new AbortController(); const child = run(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal});
    controller.abort(new Error('test cancellation')); await assert.rejects(child,/test cancellation/);
    await assert.rejects(run(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:30}),/time budget/);
    await assert.rejects(run(process.execPath,['-e','process.stdout.write("x".repeat(10000))'],{maxOutput:100}),/output exceeded/);
    const oversized=join(root,'oversized');await writeFile(oversized,'');await truncate(oversized,256*1024*1024+1);
    await assert.rejects(run(process.execPath,['-e','setInterval(()=>{},1000)'],{directory:root}),/exceeded 256 MiB/);
    await rm(oversized);
    const data = join(root,'data'); app = await startServer({port:0,data});
    const request = async (path, body, method='POST') => {
      const response = await fetch(`${app.url}/api/${path}`, body===undefined ? undefined : {method,headers:{'X-Poc':'1','Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json(); assert.ok(response.ok,JSON.stringify(result));return result;
    };
    assert.equal((await fetch(`${app.url}/api/import`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
    assert.equal((await fetch(`${app.url}/api/state`,{headers:{Origin:'https://evil.test'}})).status,403);
    assert.equal(await new Promise((resolve,reject)=>get(`${app.url}/api/state`,{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject)),403);
    assert.equal((await fetch(`${app.url}/audio/../../etc/passwd`)).status,404);
    assert.equal((await fetch(`${app.url}/api/import`,{method:'POST',headers:{'X-Poc':'1'},body:'null'})).status,400);
    const upload=await fetch(`${app.url}/api/upload?start=0&end=3`,{method:'POST',headers:{'X-Poc':'1','Content-Type':'application/octet-stream'},body:await readFile(source)});
    assert.equal(upload.status,202); const imported=await waitFor(await upload.json(),request);
    const input={start:1.25,end:1.75,gain:0};
    const first=await request(`clips/${imported.clip.id}/trim`,input);
    const repeated=await request(`clips/${imported.clip.id}/trim`,input);assert.equal(first.id,repeated.id);
    const edited=await waitFor(first,request);
    const download=await fetch(`${app.url}${edited.clip.url}`);assert.deepEqual(Buffer.from(await download.arrayBuffer()),wave);
    const range=await fetch(`${app.url}${edited.clip.url}`,{headers:{Range:'bytes=0-43'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,44);
    assert.equal((await fetch(`${app.url}${edited.clip.url}`,{headers:{Range:'bytes=9-3'}})).status,416);
    await app.close();app=undefined;
    // Simulate a crash before a job commit; completed files recover, incomplete work is not replayed.
    const interrupted='0'.repeat(24);
    await writeFile(join(data,'jobs',`${interrupted}.json`),JSON.stringify({id:interrupted,status:'running',stage:'Downloading',started_at:new Date().toISOString()}));
    app=await startServer({port:0,data});
    const state=await request('state');assert.equal(state.clips.length,2);assert.equal(state.jobs.find(j=>j.id===interrupted).status,'interrupted');
    assert.equal((await request(`clips/${imported.clip.id}/trim`,input)).id,edited.id);
    assert.deepEqual(Buffer.from(await (await fetch(`${app.url}${edited.clip.url}`)).arrayBuffer()),wave);
    assert.deepEqual(await readdir(join(data,'temporary')),[]);
    await assert.rejects(startServer({port:0,data}),/already in use/);
  } finally { await app?.close();await rm(root,{recursive:true,force:true}); }
});
