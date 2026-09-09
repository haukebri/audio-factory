import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyExport } from "./export-lineage.mjs";
import { hash } from "./dist/config.js";
import { inspectWav } from "./dist/wav.js";

const root = fileURLToPath(new URL("./", import.meta.url));
const run = (args) =>
  new Promise((done, reject) => {
    const child = spawn(process.execPath, [`${root}dist/cli.js`, ...args], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    child.stdout.on("data", (bytes) => { output += bytes; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`CLI exited ${code}: ${args[0]}`));
      try { done(JSON.parse(output)); } catch (error) { reject(error); }
    });
  });
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
async function stopped() {
  assert.equal((await run(["status"])).status, "stopped");
  const processes = execFileSync("ps", ["-axo", "pid=,args="], { encoding: "utf8" })
    .split("\n").filter((line) => line.includes(root) &&
      /dist\/cli\.js|\/bin\/python|qa\.py|sa3_mlx\.py|ffmpeg/.test(line));
  assert.deepEqual(processes, [], "Owned factory/model processes remain");
}
function bundle(audio) {
  const record = JSON.parse(readFileSync(audio.replace(/\.wav$/, ".json"), "utf8"));
  const bytes = readFileSync(audio);
  const original = readFileSync(join(dirname(audio), record.source_file));
  const lineage = verifyExport(record, bytes, () => original);
  assert.deepEqual(inspectWav(original), record.generation.audio);
  assert.equal(inspectWav(original).seconds, record.generation.request.duration_seconds);
  const cut = inspectWav(bytes);
  assert.equal(cut.seconds, lineage.duration_seconds);
  assert.ok(Math.abs(cut.peak - 10 ** (-3 / 20)) < 0.0001);
  assert.equal(record.cut.bounds.region, 1);
  assert.equal(record.cut.normalization.enabled, true);
  assert.equal(record.cut.normalization.target_peak_db, -3);
  assert.equal(record.review.status, "provisional");
  return record;
}

await stopped(); // Refuse an existing session; never discard its output to preflight.
const requestPath = `${root}examples/request.json`;
const request = await json(requestPath);
const path = `${root}.runtime/smoke-${randomUUID()}.json`;
const evidence = { request, request_sha256: hash(await readFile(requestPath)), runs: [] };
const save = () => writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`);
await save();
console.error(`Smoke evidence: ${path}`);
try {
  for (const label of ["first", "second"]) {
    const started = Date.now();
    const result = await run(["make", requestPath]);
    const entry = { label, result, wall_ms: Date.now() - started };
    evidence.runs.push(entry);
    await save();
    // Retain before any assertion can fail or another session can clear this run.
    entry.retained_audio = (await run(["retain", result.audio])).audio;
    await save();
    await stopped();
    const record = bundle(entry.retained_audio);
    assert.equal(record.generation.id, result.id);
    assert.deepEqual(record.generation.request, request);
    assert.equal(record.generation.settings.duration_padding_sec, 0);
    assert.equal(record.generation.models.length, 3);
    assert.ok(record.generation.models.some((m) => m.file.endsWith("same_s_decoder_f32.npz")));
    assert.equal(result.qa.clap.status, "completed");
    const report = await json(result.report);
    assert.equal(report.status, "completed");
    assert.equal(report.result.clap.status, "completed");
    assert.ok(record.analyses.some((analysis) => analysis.id === report.id));
    entry.audio_sha256 = record.generation.audio_sha256;
    entry.cut_sha256 = record.cut.audio_sha256;
    entry.elapsed_ms = record.generation.elapsed_ms;
    if (label === "second") {
      assert.ok(!existsSync(`${root}out/runs/${evidence.runs[0].result.id}`));
      bundle(evidence.runs[0].retained_audio);
    }
    entry.verified = true;
    await save();
  }
  evidence.status = "completed";
  await save();
  console.log(JSON.stringify({ evidence: path, ...evidence }));
} catch (error) {
  evidence.error = String(error);
  await save();
  throw error;
}
