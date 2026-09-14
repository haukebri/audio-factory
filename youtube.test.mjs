import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { processIdentity } from './dist/ownership.js';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { videoURL, importInput, convert, acquire, run, recoverAcquisition } from './youtube.mjs';
import { wavFixture } from './wav-fixture.mjs';
import { inspectWav } from './dist/wav.js';

test('YouTube boundaries, actual fractional/sample decoding and owned-process limits', async () => {
  const url = 'https://www.youtube.com/watch?v=CBDZg1Jb_T4';
  assert.equal(videoURL('https://youtu.be/CBDZg1Jb_T4?t=120'), url);
  for (const bad of ['http://youtube.com/watch?v=CBDZg1Jb_T4', 'https://youtube.com.evil/watch?v=CBDZg1Jb_T4', 'https://u:p@youtube.com/watch?v=CBDZg1Jb_T4', url + '&list=abc', 'https://127.0.0.1/', 'file:///etc/passwd']) assert.throws(() => videoURL(bad));
  for (const [start_seconds, end_seconds] of [[0, 0], [2, 1], [-1, 1], [0, 61], [NaN, 1], [0, Infinity], [0, 0.000001]]) assert.throws(() => importInput({ url, start_seconds, end_seconds }));
  assert.equal(importInput({ url, start_seconds: 120, end_seconds: 120.1 }).end_seconds, 120.1);
  assert.throws(() => importInput({ url, start_seconds: 0, end_seconds: 1, gain: 2 }));
  const root = await mkdtemp(resolve('.runtime/youtube-decoding-'));
  try {
    const source = join(root, 'tone.wav'); await writeFile(source, wavFixture(t => t >= 1 && t < 2, 3));
    const file = join(root, 'clip.wav'); await convert(source, file, { start: 1.25, end: 1.75 });
    const clip = await readFile(file), info = inspectWav(clip);
    assert.equal(info.seconds, 0.5); assert.equal(info.channels, 2); assert.ok(info.peak > 0.70 && info.peak <= 0.708);
    let crossings = 0; for (let i = 48; i < clip.length; i += 4) if (clip.readInt16LE(i - 4) <= 0 && clip.readInt16LE(i) > 0) crossings++;
    assert.ok(Math.abs(crossings - 220) <= 1, 'actual 440 Hz interval samples');
    const silent = join(root, 'silence.wav'); await convert(source, silent, { start: 0.1, end: 0.2 });
    assert.equal(inspectWav(await readFile(silent)).seconds, 0.1); assert.equal(inspectWav(await readFile(silent)).peak, 0);
    const tiny = join(root, 'sample.wav'); await convert(source, tiny, { start: 1, end: 1 + 1 / 44100 });
    assert.equal(inspectWav(await readFile(tiny)).seconds, 1 / 44100);
    await assert.rejects(convert(source, join(root, 'bad.wav'), { start: 2.5, end: 3.5 }), /outside/);
    await assert.rejects(run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 30 }), /time budget/);
    const controller = new AbortController(), child = run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal });
    controller.abort(); await assert.rejects(child);
    await assert.rejects(run(process.execPath, ['-e', 'process.stdout.write("x".repeat(1000))'], { maxOutput: 10 }), /output exceeded/);
    const owner = { root, job_id: 'a'.repeat(32) };
    const crashed = spawnSync(process.execPath, ['--input-type=module', '-e', `import {run} from './youtube.mjs'; run(process.execPath, ['-e','setInterval(()=>{},1000)'], {owner:${JSON.stringify(owner)}}); setTimeout(()=>process.exit(23), 200);`], { timeout: 10000 });
    assert.equal(crashed.status, 23);
    const registry = join(root, '.runtime/youtube-processes');
    const record = JSON.parse(await readFile(join(registry, (await readdir(registry))[0]), 'utf8'));
    assert.equal(processIdentity(record.pid), record.identity, 'owned child survived the simulated parent crash');
    await recoverAcquisition(root, owner.job_id);
    for (let i = 0; i < 100 && processIdentity(record.pid) === record.identity; i++) await new Promise(r => setTimeout(r, 10));
    assert.notEqual(processIdentity(record.pid), record.identity);
    assert.deepEqual(await readdir(registry), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('YouTube 19–25 seconds imports the selected audio, not WebM seek preroll', async () => {
  const root = await mkdtemp(resolve('.runtime/youtube-timestamps-'));
  try {
    const source = join(root, 'recording.webm'), metadata = join(root, 'recording.json');
    await writeFile(join(root, 'recording.wav'), wavFixture(t => t >= 19 && t < 25, 30));
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-i', join(root, 'recording.wav'), '-c:a', 'libopus', source]);
    // Select yt-dlp's remote FFmpeg downloader while keeping the media fixture local.
    await writeFile(metadata, JSON.stringify({ id: 'local', title: 'Timestamp fixture', duration: 30,
      url: pathToFileURL(source).href, protocol: 'https', ext: 'webm', vcodec: 'none', acodec: 'opus' }));
    const result = await acquire({ url: 'https://youtu.be/CBDZg1Jb_T4', start_seconds: 19, end_seconds: 25 }, root, {
      execute: async (command, args, options) => {
        if (args.includes('--dump-single-json')) return { stdout: Buffer.from('{"duration":30}') };
        assert.ok(args.includes('--download-sections'), 'window download must succeed');
        return run(command, [...args.slice(0, -1), '--enable-file-urls', '--load-info-json', metadata], options);
      },
    });
    const clip = await readFile(result.file);
    assert.equal(inspectWav(clip).seconds, 6);
    // Every interior second must contain the selected tone; preroll contains silence.
    for (let second = 0; second < 6; second++) {
      let energy = 0;
      for (let i = Math.round((second + .25) * 44100); i < (second + .75) * 44100; i++)
        energy += (clip.readInt16LE(44 + i * 4) / 32768) ** 2;
      assert.ok(Math.sqrt(energy / 22050) > .3, `selected tone missing at second ${second}`);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
