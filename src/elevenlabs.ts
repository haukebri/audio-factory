import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv, promisify } from "node:util";
import { config, hash, root, type Request, validateRequest } from "./config.js";
import { inspectWav } from "./wav.js";

const execute = promisify(execFile);
export const elevenModel = "eleven_text_to_sound_v2";
export function elevenKey() {
  let values: Record<string, string | undefined> = {};
  try { values = parseEnv(readFileSync(join(root, ".env"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const key = process.env.ELEVEN_KEY ?? values.ELEVEN_KEY;
  if (!key?.trim()) throw new Error("Set ELEVEN_KEY in .env or the environment");
  return key.trim();
}

// Sync before publishing: completed responses survive workflow cleanup and restarts.
async function persist(path: string, bytes: Buffer | string, exclusive = false) {
  const file = await open(exclusive ? path : `${path}.tmp`, exclusive ? "wx" : "w", 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  if (!exclusive) await rename(`${path}.tmp`, path);
}

export class ElevenLabsBackend {
  readonly provider = "elevenlabs" as const;
  private controller = new AbortController();
  constructor(private options: { root?: string; key?: () => string; fetch?: typeof fetch } = {}) {}
  async start() {
    (this.options.key ?? elevenKey)();
    await execute("ffmpeg", ["-version"]);
    this.controller = new AbortController();
  }
  async generate(request: Request, progress: (value: unknown) => void, context?: { id: string }): Promise<Buffer> {
    if (!validateRequest(request)) throw new Error("Invalid sound request");
    if (request.duration_seconds > 30) throw new Error("ElevenLabs supports a maximum of 30 seconds");
    if (!context || !/^[a-f0-9]{32}$/.test(context.id)) throw new Error("Durable run ID required");
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(config.timeout_ms)]);
    signal.throwIfAborted();
    const key = (this.options.key ?? elevenKey)();
    const directory = join(this.options.root ?? root, ".runtime/elevenlabs", context.id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    // ElevenLabs SFX has no seed parameter. Keep the original user prompt verbatim.
    const body = JSON.stringify({ text: request.prompt, duration_seconds: request.duration_seconds,
      model_id: elevenModel, prompt_influence: 0.3, loop: false });
    const signature = hash(body);
    let receipt;
    try { receipt = JSON.parse(await readFile(join(directory, "response.json"), "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (receipt && receipt.signature !== signature) throw new Error("ElevenLabs run ID conflict");
    if (!receipt) {
      try {
        await persist(join(directory, "request.json"), JSON.stringify({ signature, request: JSON.parse(body),
          submitted_at: new Date().toISOString(), status: "submitting" }, null, 2), true);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST")
          throw new Error("ElevenLabs request already submitted; inspect its receipt before creating a new paid attempt");
        throw error;
      }
      progress({ status: "generating", provider: this.provider, model: elevenModel, evidence: directory });
      // No automatic POST retry: a network failure can hide a successfully billed generation.
      const response = await (this.options.fetch ?? fetch)("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
        method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" }, body, signal,
      });
      const headers = { status: response.status, request_id: response.headers.get("request-id") ?? response.headers.get("x-request-id"),
        character_cost: response.headers.get("character-cost"), received_at: new Date().toISOString() };
      await persist(join(directory, "headers.json"), JSON.stringify(headers, null, 2));
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { detail?: { status?: string } };
        const code = typeof error.detail?.status === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(error.detail.status) ? error.detail.status : "request_failed";
        await persist(join(directory, "error.json"), JSON.stringify({ ...headers, code }));
        throw new Error(`ElevenLabs returned HTTP ${response.status} (${code}); inspect ${directory}/error.json`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("Invalid ElevenLabs audio response size");
      await persist(join(directory, "original.mp3"), bytes);
      receipt = { ...headers, signature, model: elevenModel, audio_sha256: hash(bytes), bytes: bytes.length };
      await persist(join(directory, "response.json"), JSON.stringify(receipt, null, 2));
    }
    const original = await readFile(join(directory, "original.mp3"));
    if (hash(original) !== receipt.audio_sha256) throw new Error("ElevenLabs response hash mismatch");
    progress({ status: "exporting", provider: this.provider, receipt, evidence: directory });
    signal.throwIfAborted();
    await execute("ffmpeg", ["-nostdin", "-v", "error", "-y", "-i", join(directory, "original.mp3"),
      "-ar", "44100", "-ac", "2", "-af", `volume=${config.peak_db}dB,alimiter=limit=0.7079:level=false:latency=true,apad,atrim=duration=${request.duration_seconds}`,
      "-c:a", "pcm_s16le", join(directory, "audio.wav")], { signal });
    const audio = await readFile(join(directory, "audio.wav"));
    inspectWav(audio);
    return audio;
  }
  async reset() {} // Reset never submits or repeats a paid request.
  async unload() {}
  async stop() { this.controller.abort(); }
}
