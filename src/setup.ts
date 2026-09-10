import { execFile, spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { promisify } from "node:util";

import { config, root } from "./config.js";
import { acquireCompute, recoverBackend } from "./ownership.js";

const execute = promisify(execFile);

export async function ensureSetup(generation = false, signal?: AbortSignal, inherited?: string) {
  const claim = inherited ? undefined : acquireCompute();
  try {
    await recoverBackend();
    const commands: [string, string[]][] = [];
    const python = `${root}/.runtime/signal-venv/bin/python`;
    const imports = ["-c", "import numpy, soundfile"];
    if (generation && (!existsSync(`${root}/.runtime/sa3-gguf/build-manifest.json`) || config.models.some(m => !existsSync(`${root}/.runtime/sa3-gguf/models/${m.file}`))))
      commands.push([process.execPath, [`${root}/setup.mjs`]], [python, imports]);
    else {
      try {
        await execute(python, imports, { timeout: 10000, signal });
      } catch {
        signal?.throwIfAborted();
        if (!existsSync(python))
          commands.push(["uv", ["venv", "--python", "3.11.15", `${root}/.runtime/signal-venv`]]);
        commands.push(["uv", ["pip", "sync", "--python", python, `${root}/signal-requirements.lock`]], [python, imports]);
      }
    }
    for (const [command, args] of commands) {
      signal?.throwIfAborted();
      console.error(
        "Preparing local audio factory; progress: .runtime/setup.log",
      );
      const log = openSync(`${root}/.runtime/setup.log`, "a", 0o600);
      const child = spawn(command, args, { stdio: ["ignore", log, log], detached: true,
        env: { ...process.env, AUDIO_FACTORY_COMPUTE_CLAIM: inherited ?? claim!.name } });
      closeSync(log);
      let stopping = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        stopping = true;
        if (child.pid && child.exitCode === null) {
          try {
            process.kill(-child.pid, "SIGTERM");
            killTimer ??= setTimeout(() => {
              if (child.pid && child.exitCode === null) {
                try { process.kill(-child.pid, "SIGKILL"); } catch {}
              }
            }, 5000);
          } catch {}
        }
      };
      signal?.addEventListener("abort", stop, { once: true });
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      const timer = setTimeout(stop, 90 * 60 * 1000);
      try {
        await new Promise<void>((resolve, reject) => {
          child.once("error", reject);
          child.once("exit", (code) =>
            code === 0
              ? resolve()
              : reject(new Error("Setup failed; inspect .runtime/setup.log and rerun setup")),
          );
        });
      } finally {
        if (stopping && child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
        clearTimeout(timer);
        clearTimeout(killTimer);
        signal?.removeEventListener("abort", stop);
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
      }
    }
  } finally { claim?.release(); }
}
