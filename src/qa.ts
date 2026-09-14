import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";
import { root as factoryRoot, hash } from "./config.js";

const execute = promisify(execFile);
const ajv = new Ajv2020({ strict: true, allErrors: true });
const schema = JSON.parse(await readFile(`${factoryRoot}/qa.schema.json`, "utf8"));
const validate = ajv.compile(schema);
const validReport = ajv.compile(
  JSON.parse(await readFile(`${factoryRoot}/qa-report.schema.json`, "utf8")),
);
const settings = JSON.parse(await readFile(`${factoryRoot}/qa-config.json`, "utf8"));
const validSettings = ajv.compile(
  JSON.parse(await readFile(`${factoryRoot}/qa-config.schema.json`, "utf8")),
);
if (!validSettings(settings)) throw new Error(JSON.stringify(validSettings.errors));
export class QaError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function qaRequest(kind: string, input: unknown) {
  const semantic = input as { clap?: boolean; target?: unknown; alternatives?: unknown } | null;
  if (semantic?.clap || semantic?.target !== undefined || semantic?.alternatives !== undefined)
    throw new QaError(400, "Semantic QA was removed; use deterministic signal checks");
  const value = { kind, request: input };
  if (!validate(value)) throw new QaError(400, JSON.stringify(validate.errors));
  const filters = input as { low_cut_hz?: number; high_cut_hz?: number };
  if (filters.low_cut_hz && filters.high_cut_hz && filters.low_cut_hz >= filters.high_cut_hz) throw new QaError(400, "Low cut must be below high cut");
  return input as {
    loop?: boolean;
    crossfade_seconds?: number;
    curve?: "equal-power" | "equal-gain";
    normalize?: boolean;
    peak_db?: number;
    gain_db?: number;
    noise_reduction_db?: number;
    pitch_semitones?: number; speed?: number; reverse?: boolean; low_cut_hz?: number; high_cut_hz?: number;
    clap?: boolean;
    target?: string;
    alternatives?: string[];
    start_seconds?: number;
    end_seconds?: number;
  };
}
async function save(path: string, value: unknown) {
  if (path.endsWith("report.json") || path.endsWith("attempt.json")) {
    if (!validReport(value)) throw new Error(JSON.stringify(validReport.errors));
  }
  await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
export async function qaOperation(root: string, runId: string, kind: string, input: unknown, signal?: AbortSignal) {
  let request = qaRequest(kind, input);
  const deadline = Date.now() + settings.timeout_ms;
  const runPath = join(root, "out", "runs", runId);
  const run = JSON.parse(await readFile(join(runPath, "run.json"), "utf8"));
  if (kind === "cuts" && request.loop === undefined && run.request.loop === true) request = { ...request, loop: true };
  if (run.status !== "completed") throw new QaError(409, "Source run must be completed");
  const source = join(runPath, "audio.wav");
  const sourceHash = hash(await readFile(source));
  if (sourceHash !== run.audio_sha256) throw new QaError(409, "Source audio hash mismatch");
  const implementationHash = hash(
    Buffer.concat(
      await Promise.all([
        readFile(`${factoryRoot}/qa.py`),
        readFile(`${factoryRoot}/bundle.mjs`),
        readFile(`${factoryRoot}/export-lineage.mjs`),
        readFile(`${factoryRoot}/export.schema.json`),
        readFile(`${factoryRoot}/dist/qa.js`),
        ...(kind === "cuts" ? [readFile(`${factoryRoot}/loop-audio.mjs`), readFile(`${factoryRoot}/denoise.mjs`), readFile(`${factoryRoot}/edit-audio.mjs`)] : []),
      ]),
    ),
  );
  const id = hash(
    JSON.stringify({ sourceHash, kind, request, settings, implementationHash }),
  ).slice(0, 32);
  const directory = join(runPath, kind, id);
  const deliver = async (report: Record<string, unknown>) => {
    const bundle = await execute(
      process.execPath,
      [`${factoryRoot}/bundle.mjs`, root, JSON.stringify(report)],
      {
        signal, timeout: Math.max(1, deadline - Date.now()),
        maxBuffer: 4 * 1024 * 1024,
        killSignal: "SIGKILL",
      },
    );
    report.delivery = JSON.parse(bundle.stdout);
  };
  let saved;
  try {
    saved = JSON.parse(await readFile(join(directory, "report.json"), "utf8"));
    if (!validReport(saved)) throw new Error("Invalid saved QA report");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (saved?.status === "completed" && saved.result?.clap?.status !== "failed") {
    if (kind === "cuts") {
      await deliver(saved);
      await save(join(directory, "report.json"), saved);
    }
    return saved;
  }
  if (!saved) {
    try {
      saved = JSON.parse(await readFile(join(directory, "attempt.json"), "utf8"));
      saved.status = "interrupted";
      saved.error = "Previous QA attempt did not complete; evidence retained";
      await save(join(directory, "report.json"), saved);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (saved) await rename(directory, `${directory}-attempt-${randomUUID()}`);
  const runAnalysis = async (path = source) => {
    const python = `${factoryRoot}/.runtime/signal-venv/bin/python`;
    const { stdout } = await execute(
      python,
      [`${factoryRoot}/qa.py`, path, JSON.stringify(request)],
      {
        signal, timeout: Math.max(1, deadline - Date.now()),
        maxBuffer: 4 * 1024 * 1024,
        killSignal: "SIGKILL",
        env: { ...process.env, HF_HUB_OFFLINE: "1", TOKENIZERS_PARALLELISM: "false" },
      },
    );
    return JSON.parse(stdout);
  };
  let bounds: { start: number; end: number } | undefined;
  if (kind === "cuts" && !request.loop) {
    const region =
      request.start_seconds === undefined
        ? ((await runAnalysis()).regions[0] as
            | { start_seconds: number; end_seconds: number }
            | undefined)
        : request;
    if (!region)
      throw new QaError(
        422,
        "No active region detected; choose explicit bounds or another recording",
      );
    const start = Math.round((region.start_seconds as number) * run.audio.sample_rate);
    const end = Math.round((region.end_seconds as number) * run.audio.sample_rate);
    if (start < 0 || end <= start || end > Math.round(run.audio.seconds * run.audio.sample_rate))
      throw new QaError(400, "Cut bounds must select nonempty samples within the source");
    bounds = { start, end };
  }
  await mkdir(directory, { recursive: true });
  const report: Record<string, unknown> = {
    schema: "urban:audio-factory-qa@1",
    id,
    kind,
    run_id: runId,
    source_sha256: sourceHash,
    request,
    settings,
    implementation_sha256: implementationHash,
    started_at: new Date().toISOString(),
    status: "running",
    advisory: true,
  };
  await save(join(directory, "attempt.json"), report);
  try {
    if (kind === "analyses") {
      report.result = await runAnalysis();
    } else if (request.loop || bounds) {
      const modulePath = `${factoryRoot}/loop-audio.mjs`;
      const { renderLoop, renderTrim, quantizeLoop, mixNoiseReduction } = await import(modulePath);
      const denoisePath = `${factoryRoot}/denoise.mjs`;
      const { denoise, prepareEdit } = await import(denoisePath);
      const { hasEdits } = await import(`${factoryRoot}/edit-audio.mjs`);
      const edited = hasEdits(request) ? await prepareEdit(await readFile(source), { ...request, ...(bounds ? { start_seconds: bounds.start / run.audio.sample_rate, end_seconds: bounds.end / run.audio.sample_rate } : {}) }, { signal, timeout: Math.max(1, deadline - Date.now()) }) : null;
      const processed = edited ? { samples: mixNoiseReduction(edited.samples, edited.cleaned, request.noise_reduction_db ?? 0), evidence: request.noise_reduction_db ? { ...edited.noiseEvidence, reduction_db: request.noise_reduction_db } : undefined } : await denoise(await readFile(source), request.noise_reduction_db ?? 0, {
        signal, timeout: Math.max(1, deadline - Date.now()),
      });
      const samples = processed.samples;
      if (edited) report.edit = edited.edit;
      if (processed.evidence) report.noise_reduction = processed.evidence;
      const rendered = (request.loop ? renderLoop : renderTrim)(samples, run.audio.sample_rate, run.audio.channels, {
        ...request, peak_db: request.peak_db ?? settings.export_peak_db, fade_in_ms: settings.fade_in_ms, fade_out_ms: settings.fade_out_ms,
        ...(!request.loop && bounds ? { start_seconds: bounds.start / run.audio.sample_rate, end_seconds: bounds.end / run.audio.sample_rate } : {}),
        ...(edited ? { start_seconds: 0, end_seconds: samples.length / run.audio.channels / run.audio.sample_rate } : {}),
        native_provider_loop: !edited && run.runtime?.backend === "elevenlabs" && run.settings?.loop === true,
      });
      const evidence = rendered.evidence;
      const quantized = quantizeLoop(rendered.samples);
      const pcm = Buffer.alloc(quantized.length * 2);
      for (let i = 0; i < quantized.length; i++) pcm.writeInt16LE(quantized[i] * 32768, i * 2);
      const temporary = join(directory, "cut.s16"), output = join(directory, "audio.wav");
      try {
        await writeFile(temporary, pcm);
        await execute("ffmpeg", ["-v", "error", "-nostdin", "-n", "-f", "s16le", "-ar", String(run.audio.sample_rate),
          "-ac", String(run.audio.channels), "-i", temporary, "-c:a", "pcm_s16le", output], {
          signal, timeout: Math.max(1, deadline - Date.now()), killSignal: "SIGKILL",
        });
      } finally { await rm(temporary, { force: true }); }
      if (request.loop) report.loop = { ...evidence, native_provider_loop: run.runtime?.backend === "elevenlabs" && run.settings?.loop === true };
      report.bounds = { region: request.loop || request.start_seconds !== undefined ? null : 1,
        start_sample: edited?.start ?? evidence.start_sample, end_sample: edited?.end ?? evidence.end_sample,
        sample_rate: run.audio.sample_rate, fade_seconds: request.loop ? 0 : evidence.fade_seconds,
        ...(!request.loop ? { fade_in_seconds: evidence.fade_in_seconds, fade_out_seconds: evidence.fade_out_seconds,
          processing_version: evidence.processing_version } : {}) };
      report.normalization = { enabled: request.normalize !== false, target_peak_db: request.peak_db ?? settings.export_peak_db,
        gain_db: evidence.gain_db, input_peak: evidence.input_peak, ...rendered.level };
      report.ffmpeg = (await execute("ffmpeg", ["-version"], { signal, timeout: Math.max(1, deadline - Date.now()) })).stdout.split("\n")[0];
      report.result = await runAnalysis(output);
      report.audio_sha256 = hash(await readFile(output));
      report.audio_url = `/v1/runs/${runId}/cuts/${id}/audio`;
      report.metadata_url = `/v1/runs/${runId}/cuts/${id}`;
    }
    report.status = "completed";
    report.finished_at = new Date().toISOString();
    if (kind === "cuts") {
      await deliver(report);
    }
  } catch (error) {
    report.status = "failed";
    report.error = String(error);
    report.finished_at = new Date().toISOString();
  }
  await save(join(directory, "report.json"), report);
  return report;
}
export async function qaRetrieve(
  root: string,
  runId: string,
  kind: string,
  id: string,
  audio: boolean,
) {
  const directory = join(root, "out", "runs", runId, kind, id);
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(await readFile(join(directory, "report.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new QaError(404, "Unknown QA result");
    throw error;
  }
  if (!validReport(report)) throw new Error("Invalid saved QA report");
  if (!audio) return report;
  if (kind !== "cuts" || report.status !== "completed")
    throw new QaError(409, "No completed cut audio");
  const bytes = await readFile(join(directory, "audio.wav"));
  if (hash(bytes) !== report.audio_sha256) throw new QaError(409, "Cut audio hash mismatch");
  return bytes;
}
