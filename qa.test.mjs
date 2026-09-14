import { decodeLoopWav, renderLoop, renderTrim, quantizeLoop } from "./loop-audio.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { verifyExport } from "./export-lineage.mjs";
import { root } from "./dist/config.js";
import { createFactory } from "./dist/service.js";
import { inspectWav } from "./dist/wav.js";
import { wavFixture } from "./wav-fixture.mjs";
import { qaOperation } from "./dist/qa.js";
import { createStudio } from "./studio.mjs";

test("manual trims span 60-second originals and reject bounds outside the source", async () => {
  const directory = await mkdtemp(`${root}/.runtime/qa-long-trim-`);
  const factory = await createFactory({ root: directory, token: "test", backend: {
    async generate(request) { return wavFixture(() => true, request.duration_seconds); },
    async reset() {}, async unload() {},
  } });
  let studio;
  const headers = { Authorization: "Bearer test", "Content-Type": "application/json" };
  const post = (url, input) => fetch(url, { method: "POST", headers, body: JSON.stringify(input) });
  try {
    await new Promise(resolve => factory.server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${factory.server.address().port}`;
    studio = await createStudio({ root: directory, token: "test", port: 0, fixture: true });
    const studioUrl = `http://127.0.0.1:${studio.server.address().port}`;
    for (const seconds of [60, 30]) {
      const generated = await post(`${url}/v1/sound-effects`, { prompt: "Synthetic long tone", duration_seconds: seconds });
      assert.equal(generated.status, 200);
      const source = Buffer.from(await generated.arrayBuffer());
      const id = generated.headers.get("x-run-id");
      const generation = JSON.parse(await readFile(`${directory}/out/runs/${id}/run.json`, "utf8"));
      const candidate = studio.jobs.store.saveCandidate({ attempt_id: id, fixture: true, evaluation: null,
        evidence: { generation, analyses: [], cut_failure: null, reason: "Synthetic trim fixture" } }, source);
      const route = `${studioUrl}/studio/candidates/${candidate.candidate_sha256}/cut`;
      for (const [start_seconds, end_seconds] of [[20, 20], [25, 20], [seconds - 1, seconds + 1], ...(seconds === 30 ? [[25, 35], [40, 50]] : [])]) {
        const input = { start_seconds, end_seconds };
        await assert.rejects(qaOperation(directory, id, "cuts", input), error => error.status === 400);
        assert.equal((await post(`${url}/v1/runs/${id}/cuts`, input)).status, 400);
        assert.equal((await post(route, input)).status, 400);
      }
      if (seconds === 30) continue;
      for (const [start_seconds, end_seconds] of [[40, 50], [59, 60]]) {
        const input = { start_seconds, end_seconds };
        const report = await qaOperation(directory, id, "cuts", input);
        assert.equal(report.status, "completed", report.error);
        const audio = await readFile(report.delivery.audio);
        const record = JSON.parse(await readFile(report.delivery.metadata, "utf8"));
        verifyExport(record, audio, () => source);
        assert.equal(record.cut.bounds.start_sample, start_seconds * 44100);
        assert.equal(record.cut.bounds.end_sample, end_seconds * 44100);
        assert.equal(inspectWav(audio).seconds, end_seconds - start_seconds);
        const compute = await post(`${url}/v1/runs/${id}/cuts`, input);
        assert.equal(compute.status, 200);
        assert.deepEqual(Buffer.from(await compute.arrayBuffer()), audio);
        const response = await post(route, input);
        assert.equal(response.status, 200, response.ok ? undefined : JSON.stringify({ input, error: await response.text() }));
        const trimmed = await response.json();
        const prepared = studio.jobs.store.readAsset(trimmed.candidate_sha256, "audio");
        verifyExport(trimmed.evidence, prepared, () => source);
        assert.deepEqual(trimmed.evidence.cut.bounds, record.cut.bounds);
        assert.deepEqual(prepared, audio);
      }
      assert.deepEqual(await readFile(`${directory}/out/runs/${id}/audio.wav`), source);
    }
  } finally {
    await studio?.close();
    await factory.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("QA preserves source bytes and exports bounded, repeatable derivatives", async () => {
  await mkdir(`${root}/.runtime`, { recursive: true });
  const directory = await mkdtemp(`${root}/.runtime/qa-test-`);
  console.log(`QA fixture: ${directory}`);
  const bytes = wavFixture((time) => (time >= 0.2 && time < 0.4) || (time >= 0.7 && time < 0.9));
  const backend = {
    async generate() {
      return bytes;
    },
    async reset() {},
    async unload() {},
  };
  const factory = await createFactory({ root: directory, token: "test", backend });
  await new Promise((resolve) => factory.server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${factory.server.address().port}`;
  const headers = { Authorization: "Bearer test", "Content-Type": "application/json" };
  const post = (path, input) =>
    fetch(url + path, { method: "POST", headers, body: JSON.stringify(input) });
  try {
    const generated = await post("/v1/sound-effects", { prompt: "A tone", duration_seconds: 1 });
    assert.equal(generated.status, 200);
    const id = generated.headers.get("x-run-id");
    const path = `/v1/runs/${id}`;
    assert.equal((await post(`${path}/analyses`, { clap: true })).status, 400);
    assert.equal((await post(`${path}/cuts`, { start_seconds: 0, end_seconds: 2 })).status, 400);
    const analysis = await post(`${path}/analyses`, {});
    assert.equal(analysis.status, 200);
    const result = await analysis.json();
    assert.equal(result.result.clap, undefined);
    assert.equal(result.result.regions.length, 2);
    const defaultCut = await post(`${path}/cuts`, {});
    assert.equal(defaultCut.status, 200);
    const defaultAudio = Buffer.from(await defaultCut.arrayBuffer());
    assert.ok(Math.abs(inspectWav(defaultAudio).peak - 10 ** (-3 / 20)) < 0.0001);
    const defaultReport = await (
      await fetch(url + defaultCut.headers.get("location"), { headers })
    ).json();
    assert.ok(defaultReport.bounds.start_sample > 0);
    assert.ok(defaultReport.bounds.end_sample < 0.6 * 44100);
    assert.equal(defaultReport.bounds.region, 1);
    const lineage = JSON.parse(await readFile(defaultReport.delivery.metadata, "utf8"));
    assert.equal(verifyExport(lineage, defaultAudio, () => bytes).generation.id, id);
    const quiet = await post(`${path}/cuts`, { normalize: false });
    const prepared = inspectWav(Buffer.from(await quiet.arrayBuffer()));
    assert.ok(prepared.peak < 0.2);
    const quietReport = await (
      await fetch(url + quiet.headers.get("location"), { headers })
    ).json();
    assert.equal(quietReport.normalization.enabled, false);
    assert.equal(quietReport.normalization.gain_db, 0);
    assert.ok(Math.abs(prepared.peak - inspectWav(bytes).peak) < 0.0001);
    const softer = await post(`${path}/cuts`, { peak_db: -9 });
    assert.ok(
      Math.abs(inspectWav(Buffer.from(await softer.arrayBuffer())).peak - 10 ** (-9 / 20)) < 0.0001,
    );
    for (const input of [{ start_seconds: 0.2 }, { end_seconds: 0.6 },
      { start_seconds: -0.1, end_seconds: 0.6 },
      { start_seconds: 0.6, end_seconds: 0.2 },
      { start_seconds: 0.2, end_seconds: 0.2 }]) {
      assert.equal((await post(`${path}/cuts`, input)).status, 400);
    }
    const cut = await post(`${path}/cuts`, { start_seconds: 0.2, end_seconds: 0.6 });
    assert.equal(cut.status, 200);
    const audio = Buffer.from(await cut.arrayBuffer());
    const report = await (await fetch(url + cut.headers.get("location"), { headers })).json();
    assert.equal(report.bounds.start_sample, 8820);
    assert.equal(report.bounds.end_sample - report.bounds.start_sample, 17640);
    assert.equal(report.bounds.region, null);
    assert.equal(report.bounds.fade_in_seconds, 0.01);
    assert.equal(report.bounds.fade_out_seconds, 0.1);
    // The explicit cut starts inside the tone, so a missing fade would be audible.
    const data = audio.indexOf(Buffer.from("data")) + 8;
    assert.equal(audio.readInt16LE(data), 0);
    assert.ok(Math.abs(audio.readInt16LE(data + 25 * 4)) < 10000);
    const faded = await post(`${path}/cuts`, { start_seconds: 0.21, end_seconds: 0.39, normalize: false });
    assert.equal(faded.status, 200);
    const fadedAudio = Buffer.from(await faded.arrayBuffer());
    const fadedData = fadedAudio.indexOf(Buffer.from("data")) + 8;
    const frames = fadedAudio.readUInt32LE(fadedData - 4) / 4;
    assert.equal(fadedAudio.readInt16LE(fadedData), 0);
    assert.ok(Math.abs(fadedAudio.readInt16LE(fadedData + (frames - 1) * 4)) < 20);
    assert.ok(Math.abs(fadedAudio.readInt16LE(fadedData + 1000 * 4)) > 1000);
    const decoded = decodeLoopWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    for (const gain_db of [-12, 0, 12]) {
      for (const loop of [false, true]) {
        const input = { start_seconds: 0.2, end_seconds: 0.9, gain_db, loop };
        const response = await post(`${path}/cuts`, input);
        assert.equal(response.status, 200, response.ok ? undefined : JSON.stringify({ input, error: await response.text() }));
        const wav = Buffer.from(await response.arrayBuffer());
        const actual = decodeLoopWav(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
        const expected = (loop ? renderLoop : renderTrim)(decoded.samples, decoded.sampleRate, decoded.channels, input);
        const previewPcm = quantizeLoop(expected.samples);
        assert.equal(actual.samples.length, previewPcm.length);
        assert.ok(actual.samples.every((sample, i) => sample === previewPcm[i]), 'preview PCM equals the exported PCM');
        const evidence = await (await fetch(url + response.headers.get('location'), { headers })).json();
        assert.equal(evidence.normalization.adjustment_db, gain_db);
        assert.equal(evidence.normalization.limiter_reduction_db > 0, gain_db > 0);
      }
    }
    for (const gain_db of [-12.1, 12.1, '6', null]) assert.equal((await post(`${path}/cuts`, { gain_db })).status, 400);
    const again = await post(`${path}/cuts`, { start_seconds: 0.2, end_seconds: 0.6 });
    assert.deepEqual(Buffer.from(await again.arrayBuffer()), audio);
    assert.deepEqual(Buffer.from(await (await fetch(url + report.audio_url, { headers })).arrayBuffer()), audio);
    assert.deepEqual(await readFile(`${directory}/out/runs/${id}/audio.wav`), bytes);
    assert.equal((await fetch(url + report.audio_url)).status, 401);
  } finally {
    await factory.close();
    await rm(directory, { recursive: true, force: true });
    console.log(`Removed QA fixture: ${directory}`);
  }
});

test("offline CLI retains a verifiable bundle after the temporary run is removed", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { readdir, symlink } = await import("node:fs/promises");
  const { basename, dirname, join } = await import("node:path");
  const { hash, config } = await import("./dist/config.js");
  const execute = promisify(execFile);
  const directory = await mkdtemp(`${root}/.runtime/offline-test-`);
  console.log(`Offline fixture: ${directory}`);
  const bytes = wavFixture((t) => (t >= 0.2 && t < 0.4) || (t >= 0.7 && t < 0.9));
  const factory = await createFactory({ root: directory, token: "test", backend: {
    async generate() { return bytes; }, async reset() {}, async unload() {},
  } });
  const cli = async (...args) => JSON.parse((await execute(process.execPath,
    [`${directory}/dist/cli.js`, ...args], {
      cwd: directory, timeout: 30000,
      env: { ...process.env, HF_HUB_OFFLINE: "1", NODE_PATH: "", NODE_OPTIONS: "" },
    })).stdout);
  try {
    for (const name of ["dist", "package.json", "config.json", "qa-config.json", "qa.py",
      "bundle.mjs", "loop-audio.mjs", "denoise.mjs", "edit-audio.mjs", "export-lineage.mjs", "retain.mjs", "qa-model.lock.json",
      ...(await readdir(root)).filter((name) => name.endsWith(".schema.json"))]) {
      await cp(`${root}/${name}`, `${directory}/${name}`, { recursive: true });
    }
    await symlink(`${root}/node_modules`, `${directory}/node_modules`, "dir");
    await mkdir(`${directory}/.runtime`, { recursive: true });
    await symlink(`${root}/.runtime/signal-venv`, `${directory}/.runtime/signal-venv`, "dir");
    await writeFile(`${directory}/.runtime/token`, "test", { mode: 0o600 });
    // Satisfy only the setup presence preflight; fake generation never reads weights.
    const models = `${directory}/.runtime/sa3-gguf/models`;
    await mkdir(models, { recursive: true });
    for (const model of config.models) await writeFile(join(models, model.file), "fixture only");
    await writeFile(`${directory}/.runtime/sa3-gguf/build-manifest.json`, "{}");
    await writeFile(`${directory}/setup.mjs`, 'throw new Error("Unexpected model setup");');
    await writeFile(`${directory}/qa-setup.py`, 'raise RuntimeError("Unexpected CLAP setup")');
    await new Promise((resolve) => factory.server.listen(0, "127.0.0.1", resolve));
    const port = factory.server.address().port;
    await writeFile(`${directory}/config.json`, JSON.stringify({ ...config, port }));
    const response = await fetch(`http://127.0.0.1:${port}/v1/sound-effects`, {
      method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "A tone", duration_seconds: 1, seed: 42 }),
    });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    const id = response.headers.get("x-run-id");
    const runPath = `${directory}/out/runs/${id}`;
    const originalRun = await readFile(`${runPath}/run.json`);
    for (const args of [["analyze", id], ["cut", id], ["retain", "missing.wav"]]) {
      await assert.rejects(cli(...args), /Factory is running/);
    }
    assert.deepEqual((await readdir(runPath)).sort(), ["audio.wav", "run.json"]);
    await factory.close();
    assert.deepEqual(await cli("status"), { status: "stopped" });
    assert.equal((await cli("inspect", id)).request.seed, 42);
    const analysis = await cli("analyze", id);
    assert.equal(analysis.clap, undefined);
    assert.equal(analysis.regions.length, 2);
    const { qaOperation } = await import(`${directory}/dist/qa.js`);
    await assert.rejects(qaOperation(directory, id, "analyses", { clap: true, target: "A tone" }), /removed/);
    const cut = await cli("cut", id);
    assert.deepEqual(await cli("cut", id), cut);
    const retained = await cli("retain", cut.audio);
    const destination = `${directory}/other-project`;
    await cp(dirname(retained.audio), destination, { recursive: true });
    const preparedPath = join(destination, basename(retained.audio));
    const metadataPath = preparedPath.replace(/\.wav$/, ".json");
    const record = JSON.parse(await readFile(metadataPath, "utf8"));
    const prepared = await readFile(preparedPath);
    const verify = () => verifyExport(JSON.parse(readFileSync(metadataPath)),
      readFileSync(preparedPath), (name) => readFileSync(join(destination, name)));
    assert.equal(verify().generation.id, id);
    assert.deepEqual(await readFile(join(destination, record.source_file)), bytes);
    assert.deepEqual(record.generation, JSON.parse(originalRun));
    assert.equal(record.review.status, "provisional");
    assert.deepEqual(new Set(record.review.analysis_ids), new Set([basename(dirname(analysis.report))]));
    assert.equal(record.cut.bounds.region, 1);
    assert.equal(inspectWav(prepared).sample_rate, 44100);
    assert.equal(inspectWav(prepared).channels, 2);
    assert.deepEqual(await readFile(`${runPath}/audio.wav`), bytes);
    assert.deepEqual(await readFile(`${runPath}/run.json`), originalRun);
    // Keep evidence until the destination has verified, then remove only this run.
    await rm(runPath, { recursive: true });
    assert.equal(verify().generation.id, id);
    assert.deepEqual(await readFile(retained.audio), prepared);
    for (const path of [preparedPath, metadataPath, join(destination, record.source_file)]) {
      const saved = await readFile(path);
      await rm(path);
      assert.throws(verify, /ENOENT/);
      await writeFile(path, path === metadataPath ? "{}" : Buffer.alloc(saved.length));
      assert.throws(verify, /Invalid export lineage|audio hash mismatch/);
      await writeFile(path, saved);
    }
    for (const mutate of [
      (r) => { r.cut.source_sha256 = "0".repeat(64); },
      (r) => { r.review.analysis_ids = []; },
      (r) => { r.analyses[0].source_sha256 = "0".repeat(64); },
    ]) {
      const changed = structuredClone(record);
      mutate(changed);
      assert.throws(() => verifyExport(changed, prepared, () => bytes), /lineage|references|reference mismatch/);
    }
    assert.equal(verify().generation.id, id);
    console.log(`Verified relocated bundle: ${preparedPath}; source=${hash(bytes)}; prepared=${hash(prepared)}`);
    // Exact silence is a saved offline fixture, not a valid generated non-silent run.
    await mkdir(runPath);
    const silent = wavFixture(() => false);
    await writeFile(`${runPath}/audio.wav`, silent);
    await writeFile(`${runPath}/run.json`, JSON.stringify({ ...record.generation, audio_sha256: hash(silent) }));
    await assert.rejects(cli("cut", id), /No active region detected/);
    assert.deepEqual(await readFile(`${runPath}/audio.wav`), silent);
    assert.deepEqual(await cli("status"), { status: "stopped" });
    assert.equal(factory.server.listening, false);
  } finally {
    await factory.close();
    await rm(directory, { recursive: true, force: true });
    console.log(`Removed offline fixture: ${directory}`);
  }
});

test("QA retries preserve evidence, refresh bundles and renew the idle deadline", async (t) => {
  const { readdir, rename } = await import("node:fs/promises");
  const { qaOperation } = await import("./dist/qa.js");
  const { config } = await import("./dist/config.js");
  const directory = await mkdtemp(`${root}/.runtime/qa-recovery-`);
  const previousIdle = config.idle_ms;
  let now = 0;
  t.mock.method(Date, "now", () => now);
  config.idle_ms = 1000;
  let stopped = false;
  const bytes = wavFixture(time => time > 0.2 && time < 0.4);
  const factory = await createFactory({ root: directory, token: "test", backend: {
    async generate() { return bytes; }, async reset() {}, async unload() {},
  }, shutdown() { stopped = true; } });
  try {
    await new Promise(resolve => factory.server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${factory.server.address().port}`;
    const headers = { Authorization: "Bearer test", "Content-Type": "application/json" };
    const post = (path, input) => fetch(url + path, { method: "POST", headers, body: JSON.stringify(input) });
    const generated = await post("/v1/sound-effects", { prompt: "A tone", duration_seconds: 1 });
    assert.equal(generated.status, 200);
    await generated.arrayBuffer();
    const id = generated.headers.get("x-run-id");
    const cuts = `${directory}/out/runs/${id}/cuts`;
    const request = { start_seconds: 0.21, end_seconds: 0.38 };
    const previousPath = process.env.PATH;
    let failed;
    try {
      process.env.PATH = "/nonexistent-fixture-path";
      failed = await qaOperation(directory, id, "cuts", request);
    } finally { process.env.PATH = previousPath; }
    assert.equal(failed.status, "failed");
    const failureBytes = await readFile(`${cuts}/${failed.id}/report.json`);
    // Preserve even partial output: a retry must not collide with FFmpeg's -n.
    await writeFile(`${cuts}/${failed.id}/audio.wav`, "partial output");
    const recovered = await qaOperation(directory, id, "cuts", request);
    assert.equal(recovered.status, "completed");
    const archives = (await readdir(cuts)).filter(name => name.startsWith(`${failed.id}-attempt-`));
    assert.equal(archives.length, 1);
    assert.deepEqual(await readFile(`${cuts}/${archives[0]}/report.json`), failureBytes);
    assert.equal(await readFile(`${cuts}/${archives[0]}/audio.wav`, "utf8"), "partial output");
    const originalMetadata = await readFile(recovered.delivery.metadata);
    const originalAudio = await readFile(recovered.delivery.audio);
    now = 900;
    const response = await post(`/v1/runs/${id}/analyses`, {});
    assert.equal(response.status, 200);
    const analysis = await response.json();
    now = 1100;
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(stopped, false, "QA must renew the idle deadline");
    const refreshed = await qaOperation(directory, id, "cuts", request);
    const record = JSON.parse(await readFile(refreshed.delivery.metadata));
    assert.ok(record.analyses.some(item => item.id === analysis.id));
    verifyExport(record, await readFile(refreshed.delivery.audio), () => bytes);
    assert.deepEqual(await readFile(recovered.delivery.metadata), originalMetadata);
    assert.deepEqual(await readFile(refreshed.delivery.audio), originalAudio);
    assert.deepEqual((await qaOperation(directory, id, "cuts", request)).delivery, refreshed.delivery);
    // A killed operation leaves attempt.json and partial output, but no final report.
    await rm(`${cuts}/${recovered.id}/report.json`);
    await rename(`${cuts}/${recovered.id}/audio.wav`, `${cuts}/${recovered.id}/partial.wav`);
    assert.equal((await qaOperation(directory, id, "cuts", request)).status, "completed");
    assert.equal((await readdir(cuts)).filter(name => name.startsWith(`${failed.id}-attempt-`)).length, 2);
    now = 2000;
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(stopped, true, "idle shutdown must still occur");
  } finally {
    t.mock.restoreAll();
    config.idle_ms = previousIdle;
    await factory.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('loop cuts export the rotated PCM with immutable source and accurate duration', async () => {
  const directory = await mkdtemp(`${root}/.runtime/qa-loop-`);
  const source = wavFixture(() => true, 1);
  const factory = await createFactory({ root: directory, token: 'test', backend: {
    async generate() { return source; }, async reset() {}, async unload() {},
  } });
  try {
    await new Promise(resolve => factory.server.listen(0, '127.0.0.1', resolve));
    const response = await fetch(`http://127.0.0.1:${factory.server.address().port}/v1/sound-effects`, {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Synthetic loop fixture', duration_seconds: 1 }),
    });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    const id = response.headers.get('x-run-id');
    const request = { loop: true, start_seconds: 0, end_seconds: 1, crossfade_seconds: 0.1 };
    const report = await qaOperation(directory, id, 'cuts', request);
    assert.equal(report.status, 'completed', report.error);
    const audio = await readFile(report.delivery.audio);
    assert.equal(inspectWav(audio).seconds, 0.9);
    const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const decoded = decodeLoopWav(buffer(source));
    const preview = quantizeLoop(renderLoop(decoded.samples, decoded.sampleRate, decoded.channels, request).samples);
    const savedPcm = decodeLoopWav(buffer(audio)).samples;
    assert.equal(savedPcm.length, preview.length);
    assert.equal(savedPcm.findIndex((value, i) => value !== preview[i]), -1, 'browser preview matches every exported PCM16 sample');
    assert.equal(report.loop.output_frames, 39690);
    assert.equal(report.loop.overlap_frames, 4410);
    assert.equal(report.bounds.fade_seconds, 0);
    const metadata = JSON.parse(await readFile(report.delivery.metadata, 'utf8'));
    assert.equal(verifyExport(metadata, audio, () => source).duration_seconds, 0.9);
    assert.deepEqual(await readFile(`${directory}/out/runs/${id}/audio.wav`), source);
    const again = await qaOperation(directory, id, 'cuts', request);
    assert.equal(again.id, report.id);
    assert.deepEqual(await readFile(again.delivery.audio), audio);
    // Compare the PCM end/start transition across three exported repetitions with the original adjacent frames.
    const dataOffset = audio.indexOf(Buffer.from('data')) + 8;
    const pcm = audio.subarray(dataOffset);
    const repeated = Buffer.concat([pcm, pcm, pcm]);
    const gain = 10 ** (report.loop.gain_db / 20);
    for (const boundary of [pcm.length, pcm.length * 2]) {
      for (const [offset, frame] of [[-4, 22049], [0, 22050]]) {
        const expected = source.readInt16LE(44 + frame * 4) * gain;
        assert.ok(Math.abs(repeated.readInt16LE(boundary + offset) - expected) <= 1);
      }
    }
  } finally {
    await factory.close();
    await rm(directory, { recursive: true, force: true });
  }
});
