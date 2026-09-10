import { randomInt, randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { Backend } from "./backend.js";
import { config, hash, type Request, validateRequest, validateRun } from "./config.js";
import { QaError, qaOperation, qaRequest, qaRetrieve } from "./qa.js";
import { inspectWav } from "./wav.js";
import { elevenModel } from "./elevenlabs.js";

async function atomicWrite(path: string, bytes: Buffer | string) {
  const file = await open(`${path}.tmp`, "w", 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(`${path}.tmp`, path);
}
export const atomicJson = (path: string, value: unknown) =>
  atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);

type Run = {
  schema: "urban:audio-factory-run@1";
  id: string;
  signature: string;
  status: "generating" | "completed" | "failed" | "interrupted";
  request: Request;
  started_at: string;
  finished_at?: string;
  elapsed_ms?: number;
  progress?: unknown;
  error?: string;
  audio?: ReturnType<typeof inspectWav>;
  audio_sha256?: string;
  audio_path: string;
  models: typeof config.models;
  runtime: { revision?: string; backend: string; name?: string; ggml_revision?: string; encoding?: string; model?: string };
  settings: { steps?: number; cfg_scale?: number; duration_padding_sec?: number; peak_db: number; sampler?: string; decoder?: string; text_encoder?: string; postprocess?: string; prompt_influence?: number; loop?: boolean };
  licenses: typeof config.licenses;
  review: string;
};
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (res: ServerResponse, status: number, value: unknown) => {
  if (!res.destroyed) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  }
};
async function body(req: IncomingMessage): Promise<unknown> {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new HttpError(415, "Expected application/json");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new HttpError(413, "Request exceeds 16 KiB");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Malformed JSON");
  }
}

export async function createFactory(options: {
  root: string;
  token: string;
  backend: Backend;
  ready?: () => boolean;
  computeBusy?: () => boolean;
  fresh?: boolean;
  shutdown?: () => void;
}) {
  const { root, token, backend } = options;
  const directory = join(root, "out", "runs");
  await mkdir(directory, { recursive: true });
  const runs = new Map<string, Run>();
  for (const id of options.fresh ? [] : await readdir(directory)) {
    if (!/^[a-f0-9]{32}$/.test(id)) continue;
    let source: string;
    try {
      source = await readFile(join(directory, id, "run.json"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const run: Run = JSON.parse(source);
    if (!validateRun(run))
      throw new Error(`Invalid saved run ${id}: ${JSON.stringify(validateRun.errors)}`);
    if (run.status === "generating") {
      run.status = "interrupted";
      run.error = "Service restarted before completion; use a new idempotency key";
      await atomicJson(join(directory, id, "run.json"), run);
    }
    runs.set(id, run);
  }
  let qaActive: Promise<unknown> | undefined;
  let active: { id: string; promise: Promise<void> } | undefined;
  let lastUse = Date.now();
  let unloaded = false;
  let unavailable: string | undefined;
  let maintenance = false;
  let closing = false;
  const save = (run: Run) => {
    if (!validateRun(run)) throw new Error(JSON.stringify(validateRun.errors));
    return atomicJson(join(directory, run.id, "run.json"), run);
  };
  const generate = async (run: Run) => {
    const start = Date.now();
    try {
      await mkdir(join(directory, run.id), { recursive: true });
      await save(run);
      const bytes = await backend.generate(run.request, (progress) => {
        run.progress = progress;
      }, { id: run.id });
      run.audio = inspectWav(bytes);
      if (Math.abs(run.audio.seconds - run.request.duration_seconds) > 1 / 44100)
        throw new Error("Backend audio duration does not match request");
      const path = join(directory, run.id, "audio.wav");
      await atomicWrite(path, bytes);
      run.audio_sha256 = hash(bytes);
      run.status = "completed";
      unloaded = false;
    } catch (error) {
      run.status = "failed";
      run.error = String(error);
      try {
        await backend.reset();
      } catch (failure) {
        unavailable = String(failure);
      }
    } finally {
      run.elapsed_ms = Date.now() - start;
      run.finished_at = new Date().toISOString();
      try {
        await save(run);
      } finally {
        active = undefined;
        lastUse = Date.now();
      }
    }
  };
  const audio = async (res: ServerResponse, run: Run) => {
    if (run.status !== "completed")
      throw new HttpError(
        409,
        `Run ${run.status}; inspect metadata and use a new key to regenerate`,
      );
    const bytes = await readFile(join(directory, run.id, "audio.wav"));
    if (hash(bytes) !== run.audio_sha256) throw new HttpError(500, "Stored audio hash mismatch");
    if (!res.destroyed) {
      res.writeHead(200, {
        "Content-Type": "audio/wav",
        "Content-Length": bytes.length,
        "X-Run-Id": run.id,
        Location: `/v1/runs/${run.id}`,
        "Content-Disposition": `attachment; filename="${run.id}.wav"`,
      });
      res.end(bytes);
    }
  };
  const server = createServer((req, res) => {
    void (async () => {
      if (req.headers.origin) throw new HttpError(403, "Browser origins are not accepted");
      if (req.headers.authorization !== `Bearer ${token}`)
        throw new HttpError(401, "Local bearer token required");
      const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      if (req.method === "GET" && path === "/health") {
        json(res, unavailable || options.ready?.() === false ? 503 : 200, {
          status:
            unavailable || options.ready?.() === false
              ? "unavailable"
              : active
                ? "generating"
                : qaActive
                  ? "processing"
                  : "ready",
          model: backend.provider ? elevenModel : "medium",
          encoding: backend.provider ? "mp3_44100_128" : "f16",
          backend: backend.provider ?? "metal",
          run_id: active?.id,
          progress: active ? runs.get(active.id)?.progress : undefined,
          error: unavailable,
        });
        return;
      }
      if (req.method === "POST" && path === "/shutdown" && options.shutdown) {
        json(res, 200, { status: "stopping" });
        options.shutdown();
        return;
      }
      const qaMatch =
        /^\/v1\/runs\/([a-f0-9]{32})\/(analyses|cuts)(?:\/([a-f0-9]{32})(\/audio)?)?$/.exec(path);
      if (qaMatch?.[1] && qaMatch[2]) {
        const [, runId, kind, id, suffix] = qaMatch;
        if (!runs.has(runId)) throw new HttpError(404, "Unknown run");
        if (req.method === "GET" && id) {
          const result = await qaRetrieve(root, runId, kind, id, Boolean(suffix));
          if (Buffer.isBuffer(result)) {
            res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": result.length });
            res.end(result);
          } else json(res, 200, result);
          return;
        }
        if (req.method === "POST" && !id) {
          const input = await body(req);
          qaRequest(kind, input);
          if (closing) throw new HttpError(503, "Service stopping");
          if (active || maintenance || qaActive || options.computeBusy?.()) {
            res.setHeader("Retry-After", "1");
            throw new HttpError(429, "Factory busy");
          }
          qaActive = qaOperation(root, runId, kind, input);
          try {
            const report = (await qaActive) as {
              id: string;
              status: string;
              audio_url?: string;
              delivery?: { audio: string };
            };
            res.setHeader("Location", `/v1/runs/${runId}/${kind}/${report.id}`);
            if (kind === "cuts" && report.status === "completed") {
              const bytes = (await qaRetrieve(root, runId, kind, report.id, true)) as Buffer;
              res.writeHead(200, {
                "Content-Type": "audio/wav",
                "Content-Length": bytes.length,
                ...(report.delivery ? { "X-Audio-Path": report.delivery.audio } : {}),
              });
              res.end(bytes);
            } else json(res, report.status === "completed" ? 200 : 502, report);
          } finally {
            qaActive = undefined;
            lastUse = Date.now();
          }
          return;
        }
        throw new HttpError(404, "Unknown QA endpoint");
      }
      const match = /^\/v1\/runs\/([a-f0-9]{32})(\/audio)?$/.exec(path);
      if (req.method === "GET" && match?.[1]) {
        const run = runs.get(match[1]);
        if (!run) throw new HttpError(404, "Unknown run");
        if (match[2]) await audio(res, run);
        else json(res, 200, run);
        return;
      }
      if (req.method !== "POST" || path !== "/v1/sound-effects")
        throw new HttpError(404, "Unknown endpoint");
      const input = await body(req);
      if (!validateRequest(input)) throw new HttpError(400, JSON.stringify(validateRequest.errors));
      const source = input as Request;
      const request = {
        prompt: source.prompt,
        duration_seconds: source.duration_seconds ?? config.default_duration_seconds,
        seed: source.seed,
      };
      const key = req.headers["idempotency-key"] ?? randomUUID();
      if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(key))
        throw new HttpError(400, "Invalid idempotency key");
      const id = hash(key).slice(0, 32);
      const signature = hash(JSON.stringify(request));
      const existing = runs.get(id);
      if (existing) {
        if (existing.signature !== signature)
          throw new HttpError(409, "Idempotency key already belongs to another request");
        if (active?.id === id) await active.promise;
        await audio(res, existing);
        return;
      }
      if (options.ready?.() === false) throw new HttpError(503, "Backend starting");
      if (unavailable) throw new HttpError(503, unavailable);
      if (closing) throw new HttpError(503, "Service stopping");
      if (active || maintenance || qaActive || options.computeBusy?.()) {
        res.setHeader("Retry-After", "1");
        throw new HttpError(429, "Factory busy; retry with the same key");
      }
      const run: Run = {
        schema: "urban:audio-factory-run@1",
        id,
        signature,
        status: "generating",
        request: { ...request, seed: request.seed ?? randomInt(2147483648) },
        started_at: new Date().toISOString(),
        audio_path: `out/runs/${id}/audio.wav`,
        models: config.models,
        runtime: { revision: config.runtime_revision, backend: "metal", name: "sa3.cpp", ggml_revision: config.ggml_revision, encoding: "F16" },
        settings: {
          sampler: "LogSNR(2000,-6.2,0,2); flash_attention=off",
          decoder: "SAME-L F16; monolithic",
          text_encoder: "T5Gemma F32",
          postprocess: "latent_rescale=1; latent_shift=0; latent_target_std=off; peak_normalize=off; limiter=off; PCM16 then FFmpeg attenuation",
          steps: config.steps,
          cfg_scale: 1,
          duration_padding_sec: config.duration_padding_sec,
          peak_db: config.peak_db,
        },
        licenses: config.licenses,
        review: "provisional: listening and semantic review not performed",
        ...(backend.provider === "elevenlabs" ? {
          models: [],
          runtime: { backend: "elevenlabs", model: elevenModel },
          settings: { peak_db: config.peak_db, prompt_influence: 0.3, loop: false,
            postprocess: "MP3 decoded to stereo PCM16 44100 Hz; attenuation and peak ceiling; padded/trimmed to requested duration. Seed is local bookkeeping only." },
          licenses: [{ name: "ElevenLabs Terms of Use", url: "https://elevenlabs.io/terms-of-use" }],
        } : {}),
      };
      runs.set(id, run);
      active = { id, promise: generate(run) };
      await active.promise;
      if (run.status !== "completed") throw new HttpError(502, run.error ?? "Generation failed");
      await audio(res, run);
    })().catch((error) =>
      json(res, error instanceof HttpError || error instanceof QaError ? error.status : 500, {
        error: String(error),
      }),
    );
  });
  server.requestTimeout = config.timeout_ms + 30000;
  const idle = setInterval(() => {
    if (
      active ||
      qaActive ||
      maintenance ||
      unloaded ||
      unavailable ||
      options.ready?.() === false ||
      Date.now() - lastUse < config.idle_ms
    )
      return;
    if (options.shutdown) {
      closing = true;
      options.shutdown();
      return;
    }
    maintenance = true;
    void backend
      .unload()
      .then(
        () => {
          unloaded = true;
        },
        (error) => {
          unavailable = String(error);
        },
      )
      .finally(() => {
        maintenance = false;
      });
  }, 1000);
  idle.unref();
  return {
    server,
    beginSession: async () => {
      if (!server.listening || active || qaActive)
        throw new Error("Session cleanup requires an owned idle listening socket");
      await rm(join(root, "out"), { recursive: true, force: true });
      await mkdir(directory, { recursive: true });
      await mkdir(join(root, "out", "work"), { recursive: true });
      runs.clear();
      lastUse = Date.now();
    },
    busy: () => Boolean(active || qaActive),
    close: async () => {
      closing = true;
      clearInterval(idle);
      await active?.promise;
      await qaActive?.catch(() => undefined);
      server.closeAllConnections();
      if (server.listening)
        await new Promise<void>((done, reject) =>
          server.close((error) => (error ? reject(error) : done())),
        );
    },
  };
}
