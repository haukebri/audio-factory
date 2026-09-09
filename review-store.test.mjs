import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { openReviewStore } from "./review-store.mjs";
import { verifyExport } from "./export-lineage.mjs";
import { config } from "./dist/config.js";
import { inspectWav } from "./dist/wav.js";
import { wavFixture } from "./wav-fixture.mjs";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const moduleUrl = new URL("./review-store.mjs", import.meta.url).href;

test("durable candidate and immutable human review lifecycle (model-free smoke)", async () => {
  mkdirSync(".runtime", { recursive: true });
  const root = mkdtempSync(resolve(".runtime/review-store-test-"));
  console.log(`Created owned fixture: ${root}`);
  const out = `${root}/out`;
  mkdirSync(out);
  const source = wavFixture();
  const audio = wavFixture(t => t > 0.1 && t < 0.9);
  const generation = {
    schema: "urban:audio-factory-run@1", id: "1".repeat(32), signature: "2".repeat(64), status: "completed",
    request: { prompt: "Synthetic tone fixture", duration_seconds: 1, seed: 42 },
    started_at: "2026-09-09T00:00:00.000Z", finished_at: "2026-09-09T00:00:01.000Z", elapsed_ms: 1000,
    audio_path: `out/runs/${"1".repeat(32)}/audio.wav`, audio: inspectWav(source), audio_sha256: hash(source),
    models: config.models, runtime: { revision: config.runtime_revision, backend: "mlx" },
    settings: { steps: config.steps, cfg_scale: 1, duration_padding_sec: 0, peak_db: -3 }, licenses: config.licenses,
    review: "provisional: synthetic fixture, no human listening",
  };
  const cut = {
    schema: "urban:audio-factory-qa@1", id: "3".repeat(32), kind: "cuts", run_id: generation.id,
    source_sha256: hash(source), request: {}, settings: {}, implementation_sha256: "4".repeat(64),
    started_at: generation.started_at, finished_at: generation.finished_at, status: "completed", advisory: true,
    bounds: { start_sample: 0, end_sample: 44100, sample_rate: 44100, fade_seconds: 0 },
    audio_sha256: hash(audio), ffmpeg: "synthetic fixture; no ffmpeg invocation",
  };
  const analysis = { ...cut, id: "5".repeat(32), kind: "analyses", result: { clap: { status: "disabled" }, regions: [] } };
  const bundle = { schema: "urban:audio-factory-export@1", source_file: `${cut.id}-source.wav`, generation, cut,
    analyses: [analysis], review: { status: "provisional", rationale: "Synthetic fixture", analysis_ids: [analysis.id] } };
  const candidate = { attempt_id: "6".repeat(32), fixture: true, evidence: bundle,
    evaluation: { actor: "automatic", audio_sha256: hash(audio), model: "fixture", revision: "fixture-v1",
      rubric_sha256: "7".repeat(64), verdict: "rejected", reason_tags: ["artifacts"], note: "Synthetic automatic decision" } };
  const original = JSON.stringify(bundle);
  writeFileSync(`${out}/${cut.id}.json`, original);
  writeFileSync(`${out}/${cut.id}.wav`, audio);
  writeFileSync(`${out}/${bundle.source_file}`, source);
  writeFileSync(`${out}/input.json`, JSON.stringify(candidate));
  assert.throws(() => openReviewStore(`${out}/studio`), /outside out/);
  let store = openReviewStore(`${root}/.runtime/studio`);
  try {
    assert.equal(verifyExport(bundle, audio, () => source).review.status, "provisional");
    for (const status of ["accepted", "rejected", "auto_accepted", "needs_review"])
      assert.equal(verifyExport({ ...bundle, review: { ...bundle.review, status } }, audio, () => source).review.status, status);
    const saved = store.saveCandidate(candidate, source, audio);
    const id = saved.candidate_sha256;
    assert.deepEqual(store.saveCandidate({ ...candidate, evidence: { ...bundle } }, source, audio), saved);
    const event = { event_id: "a".repeat(32), candidate_sha256: id, supersedes: null, actor: "human",
      verdict: "accepted", reason_tags: [], note: "Synthetic approval; no listening" };
    const approved = store.feedback(event);
    const rejected = store.feedback({ ...event, event_id: "b".repeat(32), supersedes: approved.event_id, verdict: "rejected", reason_tags: ["bad_trim"] });
    const correction = store.feedback({ ...event, event_id: "c".repeat(32), supersedes: rejected.event_id, note: "Synthetic correction" });
    assert.deepEqual(store.feedback(event), approved, "old identical retries stay idempotent");
    assert.throws(() => store.feedback({ ...event, verdict: "rejected" }), /conflict/);
    assert.throws(() => store.feedback({ ...event, event_id: "d".repeat(32) }), /Stale/);
    assert.equal(store.history(id).at(-1).event_id, correction.event_id);
    assert.equal(store.loadCandidate(id).evaluation.verdict, "rejected");
    assert.equal(store.loadCandidate(id).evidence.review.status, "provisional");
    assert.deepEqual(store.evaluationData(), [], "fixture labels cannot enter quality metrics");
    const real = store.saveCandidate({ ...candidate, fixture: false }, source, audio);
    assert.deepEqual(store.evaluationData(), [], "automatic verdict and legacy review are not human labels");
    store.feedback({ ...event, candidate_sha256: real.candidate_sha256 });
    assert.equal(store.evaluationData().length, 1); // Exercises eligibility only, never real listening evidence.

    // Two independent processes compete for the same predecessor; exactly one may publish.
    const concurrent = n => new Promise(resolveChild => {
      const input = { ...event, candidate_sha256: real.candidate_sha256, event_id: String(n).repeat(32), supersedes: event.event_id };
      const child = spawn(process.execPath, ["--input-type=module", "-e",
        `import { openReviewStore } from ${JSON.stringify(moduleUrl)}; openReviewStore(${JSON.stringify(`${root}/.runtime/studio`)}).feedback(${JSON.stringify(input)});`], { stdio: "ignore" });
      child.on("error", () => resolveChild(-1)); child.on("exit", resolveChild);
    });
    assert.deepEqual((await Promise.all([concurrent(8), concurrent(9)])).sort(), [0, 1]);
    assert.equal(store.history(real.candidate_sha256).length, 2);

    const sourceOnly = { ...candidate, attempt_id: "8".repeat(32), evaluation: null,
      evidence: { generation, analyses: [analysis], cut_failure: null, reason: "No active region detected" } };
    const raw = store.saveCandidate(sourceOnly, source);
    store.feedback({ ...event, candidate_sha256: raw.candidate_sha256, verdict: "rejected", reason_tags: ["wrong_sound"] });
    assert.deepEqual(store.readAsset(raw.candidate_sha256, "source"), source);
    assert.throws(() => store.readAsset(raw.candidate_sha256, "audio"), /No delivered/);
    const failure = { ...cut, status: "failed", error: "Interrupted cut fixture" };
    store.saveCandidate({ ...sourceOnly, evidence: { ...sourceOnly.evidence, cut_failure: failure } }, source);
    assert.throws(() => store.saveCandidate({ ...sourceOnly, evidence: { ...sourceOnly.evidence, cut_failure: cut } }, source), /lineage/);

    for (const invalid of ["../out", "A".repeat(64), "x", null]) assert.throws(() => store.loadCandidate(invalid), /Invalid review ID/);
    assert.throws(() => store.readAsset(id, "../candidate.json"), /Unknown/);
    for (const change of [{ actor: "automatic" }, { note: "x".repeat(4001) }, { reason_tags: ["unknown"] }, { candidate_sha256: "../out" }])
      assert.throws(() => store.feedback({ ...event, ...change }), /Invalid review/);
    assert.throws(() => store.saveCandidate(candidate, Buffer.from("bad"), audio), /source hash/);
    assert.throws(() => store.saveCandidate(candidate, source, Buffer.from("bad")), /audio hash/);
    assert.throws(() => store.saveCandidate({ ...candidate, evaluation: { ...candidate.evaluation, audio_sha256: "0".repeat(64) } }, source, audio), /Evaluation audio/);
    assert.throws(() => store.saveCandidate({ ...candidate, evidence: { ...bundle, source_file: "../../secret" } }, source, audio), /Invalid review/);

    // Crash after source write, before audio write: pending evidence remains invisible and retryable.
    const crashRoot = `${root}/crashed`;
    assert.throws(() => execFileSync(process.execPath, ["--input-type=module", "-e", `
      import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
      const original = fs.openSync;
      fs.openSync = (path, ...args) => { if (String(path).endsWith('/audio.wav') && args[0] === 'wx') process.exit(23); return original(path, ...args); };
      syncBuiltinESMExports();
      const { openReviewStore } = await import(${JSON.stringify(moduleUrl)});
      const input = JSON.parse(fs.readFileSync(${JSON.stringify(`${out}/input.json`)}));
      openReviewStore(${JSON.stringify(crashRoot)}).saveCandidate(input, fs.readFileSync(${JSON.stringify(`${out}/${bundle.source_file}`)}), fs.readFileSync(${JSON.stringify(`${out}/${cut.id}.wav`)}));
    `], { stdio: "pipe" }), error => error.status === 23);
    const recovered = openReviewStore(crashRoot);
    assert.deepEqual(recovered.listCandidates(), []);
    const partial = `${crashRoot}/pending/${readdirSync(`${crashRoot}/pending`)[0]}`;
    assert.ok(existsSync(`${partial}/source.wav`));
    assert.ok(!existsSync(`${partial}/audio.wav`));
    assert.equal(recovered.saveCandidate(candidate, source, audio).candidate_sha256, id);
    assert.ok(existsSync(partial), "interrupted evidence is retained for diagnosis");
    assert.equal(readFileSync(`${out}/${cut.id}.json`, "utf8"), original);
    assert.deepEqual(readFileSync(`${out}/${cut.id}.wav`), audio);
    assert.deepEqual(readFileSync(`${out}/${bundle.source_file}`), source);
    console.log(`Verified hashes: source=${hash(source)} audio=${hash(audio)} candidate=${id} original_bundle=${hash(original)}`);

    cpSync(`${root}/.runtime/studio`, `${root}/relocated`, { recursive: true });
    rmSync(out, { recursive: true });
    console.log(`Deleted only owned fixture out: ${out}; relocated store: ${root}/relocated`);
    const restarted = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { openReviewStore } from ${JSON.stringify(moduleUrl)};
      const store = openReviewStore(${JSON.stringify(`${root}/relocated`)});
      console.log(JSON.stringify({ candidates: store.listCandidates(), history: store.history(${JSON.stringify(id)}), source: store.readAsset(${JSON.stringify(id)}, 'source').length }));
    `], { encoding: "utf8" }));
    assert.equal(restarted.candidates.length, 4);
    assert.equal(restarted.history.length, 3);
    assert.equal(restarted.history.at(-1).verdict, "accepted");
    assert.equal(restarted.source, source.length);
    store = openReviewStore(`${root}/relocated`);
    assert.equal(store.history(raw.candidate_sha256).at(-1).verdict, "rejected");
    const asset = `${root}/relocated/candidates/${id}/audio.wav`;
    rmSync(asset); symlinkSync(`${root}/.runtime/studio/candidates/${id}/audio.wav`, asset);
    assert.throws(() => store.readAsset(id, "audio"), /ELOOP/);
    rmSync(asset); writeFileSync(asset, "corrupt");
    assert.throws(() => store.loadCandidate(id), /audio hash/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.ok(!existsSync(root));
    console.log(`Removed owned fixture and child processes exited: ${root}`);
  }
});
