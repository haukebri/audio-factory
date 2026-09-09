import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, createReadStream, openSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { config, type Request, root, sleep } from "./config.js";
import { processIdentity, stopOwned } from "./ownership.js";

export type Backend = {
  generate(request: Request, progress: (value: unknown) => void): Promise<Buffer>;
  reset(): Promise<void>;
  unload(): Promise<void>;
};

export class MlxBackend implements Backend {
  child?: ChildProcess;
  private source = `${root}/.runtime/official-sa3`;
  private python = `${root}/.runtime/mlx-venv/bin/python`;
  async start() {
    try {
      const owner = JSON.parse(await readFile(`${root}/.runtime/backend-owner.json`, "utf8"));
      await stopOwned(owner);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const git = (args: string[]) =>
      execFileSync("git", ["-C", this.source, ...args], { encoding: "utf8" }).trim();
    if (
      git(["rev-parse", "HEAD"]) !== config.runtime_revision ||
      git(["status", "--porcelain", "--untracked-files=no"])
    )
      throw new Error("MLX source revision or tracked files mismatch; run setup");
    const installed = execFileSync("uv", ["pip", "freeze", "--python", this.python], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (installed.trim() !== (await readFile(`${root}/requirements.lock`, "utf8")).trim())
      throw new Error("MLX dependency lock mismatch; run setup");
    execFileSync(this.python, ["-c", "import mlx.core as mx; assert mx.metal.is_available()"]);
    for (const model of config.models) {
      const digest = createHash("sha256");
      for await (const chunk of createReadStream(
        `${this.source}/optimized/mlx/models/mlx/${model.file}`,
      ))
        digest.update(chunk);
      if (digest.digest("hex") !== model.sha256)
        throw new Error(`Model hash mismatch: ${model.file}`);
    }
  }
  private async run(command: string, args: string[], logPath: string) {
    const log = openSync(logPath, "a", 0o600);
    const child = spawn(command, args, {
      cwd: `${this.source}/optimized/mlx`,
      env: { ...process.env, HF_HUB_OFFLINE: "1" },
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
          JSON.stringify({ pid: child.pid, identity }),
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
      await this.stop();
    }
  }
  async generate(request: Request, progress: (value: unknown) => void): Promise<Buffer> {
    const directory = await mkdtemp(`${root}/out/work/mlx-job-`);
    await writeFile(`${directory}/request.json`, JSON.stringify(request));
    progress({ status: "generating", evidence: directory });
    await this.run(
      this.python,
      [
        `${this.source}/optimized/mlx/scripts/sa3_mlx.py`,
        "--dit",
        "sm-sfx",
        "--decoder",
        "same-s",
        "--dit-dtype",
        "fp16",
        "--prompt",
        request.prompt,
        "--seconds",
        String(request.duration_seconds),
        "--seed",
        String(request.seed),
        "--steps",
        String(config.steps),
        "--cfg",
        "1",
        "--out",
        `${directory}/raw.wav`,
      ],
      `${directory}/inference.log`,
    );
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
  async stop() {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    for (let i = 0; i < 50 && child.exitCode === null && child.signalCode === null; i++)
      await sleep(100);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await sleep(100);
  }
  async reset() {
    await this.stop();
    await this.start();
  }
}
