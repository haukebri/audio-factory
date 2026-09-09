import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
  const value = { kind, request: input };
  if (!validate(value)) throw new QaError(400, JSON.stringify(validate.errors));
  return input as {
    normalize?: boolean;
    peak_db?: number;
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
export async function qaOperation(root: string, runId: string, kind: string, input: unknown) {
  const request = qaRequest(kind, input);
  const deadline = Date.now() + settings.timeout_ms;
  const runPath = join(root, "out", "runs", runId);
  const run = JSON.parse(await readFile(join(runPath, "run.json"), "utf8"));
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
        readFile(`${factoryRoot}/qa-model.lock.json`),
        readFile(`${factoryRoot}/dist/qa.js`),
        readFile(`${factoryRoot}/qa-requirements.lock`),
      ]),
    ),
  );
  const id = hash(
    JSON.stringify({ sourceHash, kind, request, settings, implementationHash }),
  ).slice(0, 32);
  const directory = join(runPath, kind, id);
  try {
    const saved = JSON.parse(await readFile(join(directory, "report.json"), "utf8"));
    if (!validReport(saved)) throw new Error("Invalid saved QA report");
    return saved;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    const previous = JSON.parse(await readFile(join(directory, "attempt.json"), "utf8"));
    previous.status = "interrupted";
    previous.error = "Previous QA attempt did not complete; evidence retained";
    await save(join(directory, "report.json"), previous);
    return previous;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const runAnalysis = async (clap: boolean) => {
    const python = `${factoryRoot}/.runtime/${clap ? "qa" : "mlx"}-venv/bin/python`;
    const { stdout } = await execute(
      python,
      [`${factoryRoot}/qa.py`, source, JSON.stringify({ ...request, clap })],
      {
        timeout: Math.max(1, deadline - Date.now()),
        maxBuffer: 4 * 1024 * 1024,
        killSignal: "SIGKILL",
        env: { ...process.env, HF_HUB_OFFLINE: "1", TOKENIZERS_PARALLELISM: "false" },
      },
    );
    return JSON.parse(stdout);
  };
  let bounds: { start: number; end: number } | undefined;
  if (kind === "cuts") {
    const region =
      request.start_seconds === undefined
        ? ((await runAnalysis(false)).regions[0] as
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
      report.result = await runAnalysis(false);
      if (request.clap) {
        await save(join(directory, "signal.json"), report.result);
        try {
          report.result = await runAnalysis(true);
        } catch (error) {
          (report.result as Record<string, unknown>).clap = {
            status: "failed",
            error: String(error),
          };
        }
      }
    } else if (bounds) {
      const rate = run.audio.sample_rate;
      const seconds = (bounds.end - bounds.start) / rate;
      const fade = Math.min(settings.fade_ms / 1000, seconds / 2);
      const filters = `atrim=start_sample=${bounds.start}:end_sample=${bounds.end},asetpts=PTS-STARTPTS,afade=t=in:d=${fade},afade=t=out:st=${seconds - fade}:d=${fade}`;
      const output = join(directory, "audio.wav");
      const { stdout: pcm } = await execute(
        "ffmpeg",
        ["-v", "error", "-nostdin", "-i", source, "-af", filters, "-f", "f32le", "-"],
        {
          encoding: "buffer",
          timeout: Math.max(1, deadline - Date.now()),
          maxBuffer: 32 * 1024 * 1024,
          killSignal: "SIGKILL",
        },
      );
      let peak = 0;
      for (let offset = 0; offset < pcm.length; offset += 4) {
        const sample = pcm.readFloatLE(offset);
        if (!Number.isFinite(sample)) throw new Error("Nonfinite export sample");
        peak = Math.max(peak, Math.abs(sample));
      }
      const target = request.peak_db ?? settings.export_peak_db;
      const gain = request.normalize === false || peak === 0 ? 0 : target - 20 * Math.log10(peak);
      report.normalization = {
        enabled: request.normalize !== false,
        target_peak_db: target,
        gain_db: gain,
        input_peak: peak,
      };
      await execute(
        "ffmpeg",
        [
          "-v",
          "error",
          "-nostdin",
          "-n",
          "-i",
          source,
          "-af",
          `${filters},volume=${gain}dB`,
          "-c:a",
          "pcm_s16le",
          output,
        ],
        { timeout: Math.max(1, deadline - Date.now()), killSignal: "SIGKILL" },
      );
      report.bounds = {
        region: request.start_seconds === undefined ? 1 : null,
        start_sample: bounds.start,
        end_sample: bounds.end,
        sample_rate: rate,
        fade_seconds: fade,
      };
      report.ffmpeg = (
        await execute("ffmpeg", ["-version"], { timeout: Math.max(1, deadline - Date.now()) })
      ).stdout.split("\n")[0];
      report.audio_sha256 = hash(await readFile(output));
      report.audio_url = `/v1/runs/${runId}/cuts/${id}/audio`;
      report.metadata_url = `/v1/runs/${runId}/cuts/${id}`;
    }
    report.status = "completed";
    report.finished_at = new Date().toISOString();
    if (kind === "cuts") {
      const bundle = await execute(
        process.execPath,
        [`${factoryRoot}/bundle.mjs`, root, JSON.stringify(report)],
        {
          timeout: Math.max(1, deadline - Date.now()),
          maxBuffer: 4 * 1024 * 1024,
          killSignal: "SIGKILL",
        },
      );
      report.delivery = JSON.parse(bundle.stdout);
    }
  } catch (error) {
    report.status = "failed";
    report.error = String(error);
  }
  report.finished_at = new Date().toISOString();
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
