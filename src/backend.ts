import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { config, type Request, root, sleep, validateRequest } from "./config.js";
import { acquireCompute, processIdentity, recoverBackend } from "./ownership.js";

export type Backend = {
  provider?: "elevenlabs";
  generate(request: Request, progress: (value: unknown) => void, context?: { id: string }): Promise<Buffer>;
  reset(): Promise<void>;
  unload(): Promise<void>;
};

export class GgufBackend implements Backend {
  child?: ChildProcess;
  private canceled = false;
  private source = `${root}/.runtime/sa3-gguf`;
  private claim?: ReturnType<typeof acquireCompute>;
  reserve() {
    return (this.claim ??= acquireCompute()).name;
  }
  async start() {
    this.reserve();
    this.canceled = false;
    await recoverBackend();
    const setupPath = `${root}/setup.mjs`;
    const { verifyGeneration } = await import(setupPath);
    await verifyGeneration();
    await this.run(`${this.source}/build-metal/bin/sa3-smoke`, [], `${root}/.runtime/metal-device.log`);
    if (!/GPU\s+MTL\d+\s+Apple/.test(await readFile(`${root}/.runtime/metal-device.log`, "utf8")))
      throw new Error("Apple Metal device unavailable; no CPU fallback");
  }

  private async run(command: string, args: string[], logPath: string) {
    if (this.canceled) throw new Error("Audio operation canceled");
    const log = openSync(logPath, "w", 0o600);
    const child = spawn(command, args, {
      cwd: this.source,
      // Pin runtime behavior: ignore user SA3/GGML overrides and .env files.
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(SA3_|GGML_)/.test(key))),
        SA3_ENV_FILE: "/dev/null", SA3_DEVICE: "metal", SA3_GPU: "Apple", SA3_FLASH_ATTN: "0", SA3_SAME_FLASH_ATTN: "0" },
      stdio: ["ignore", log, log],
    });
    closeSync(log);
    this.child = child;
    const finished = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`Audio process failed (${code ?? signal}); inspect ${logPath}`));
      });
    });
    finished.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (child.pid) {
        const identity = processIdentity(child.pid);
        if (!identity) throw new Error("Cannot establish audio process ownership");
        await writeFile(
          `${root}/.runtime/backend-owner.json`,
          JSON.stringify({ pid: child.pid, identity, session: this.claim!.owner }),
          { mode: 0o600 },
        );
      }
      await Promise.race([
        finished,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Audio process deadline exceeded")),
            config.timeout_ms,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      await this.reap();
    }
  }
  async generate(request: Request, progress: (value: unknown) => void): Promise<Buffer> {
    if (!validateRequest(request) || request.seed === undefined)
      throw new Error("Valid prompt, duration and resolved seed required");
    if (this.canceled) throw new Error("Audio operation canceled");
    this.reserve();
    await recoverBackend();
    await mkdir(`${root}/out/work`, { recursive: true });
    const directory = await mkdtemp(`${root}/out/work/gguf-job-`);
    await writeFile(`${directory}/request.json`, JSON.stringify(request));
    progress({ status: "generating", evidence: directory });
    await this.run(
      `${this.source}/build-metal/bin/sa3-generate`,
      [
        ...["--cond", "--dit", "--same", "--t5", "--tok"].flatMap((flag, i) => [flag, `${this.source}/models/${config.models[i]!.file}`]),
        "--prompt", request.prompt,
        "--duration", String(request.duration_seconds),
        "--seed", String(request.seed),
        "--steps", String(config.steps),
        "--cfg-scale", "1", "--duration-padding", "0",
        "--dist-shift", "LogSNR", "--dist-shift-params", "2000,-6.2,0,2",
        "--no-peak-normalize", "--no-limiter",
        "--out", `${directory}/raw.wav`,
      ],
      `${directory}/inference.log`,
    );
    const log = await readFile(`${directory}/inference.log`, "utf8");
    if (!/\[sa3\] backend: MTL\d+ \(Apple/.test(log) || /\[sa3\] backend: CPU/.test(log))
      throw new Error("Inference did not use Apple Metal; output preserved but not accepted");
    progress({ status: "exporting", evidence: directory });
    await this.run(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-i",
        `${directory}/raw.wav`,
        "-af",
        `volume=${config.peak_db}dB`,
        "-c:a",
        "pcm_s16le",
        `${directory}/audio.wav`,
      ],
      `${directory}/export.log`,
    );
    return readFile(`${directory}/audio.wav`);
  }
  async unload() {}
  async cancel() {
    this.canceled = true;
    await this.reap();
  }
  async stop() {
    await this.cancel();
    this.claim?.release();
    this.claim = undefined;
  }
  private async reap() {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    for (let i = 0; i < 50 && child.exitCode === null && child.signalCode === null; i++)
      await sleep(100);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    if (child.exitCode === null && child.signalCode === null)
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  }
  async reset() {
    await this.reap();
    if (!this.canceled) await this.start();
  }
}
