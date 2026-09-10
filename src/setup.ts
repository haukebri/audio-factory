import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";

import { config, root } from "./config.js";

export async function ensureSetup(generation = false, signal?: AbortSignal) {
  const commands: [string, string[]][] = [];
  if (!existsSync(`${root}/.runtime/signal-venv/bin/python`)) {
    commands.push(["uv", ["venv", "--python", "3.11.15", `${root}/.runtime/signal-venv`]]);
    commands.push(["uv", ["pip", "sync", "--python", `${root}/.runtime/signal-venv/bin/python`, `${root}/signal-requirements.lock`]]);
  }
  if (generation && (!existsSync(`${root}/.runtime/sa3-gguf/build-manifest.json`) || config.models.some(m => !existsSync(`${root}/.runtime/sa3-gguf/models/${m.file}`))))
    commands.unshift([process.execPath, [`${root}/setup.mjs`]]);
  for (const [command, args] of commands) {
    signal?.throwIfAborted();
    console.error(
      "Preparing local audio factory; progress: .runtime/setup.log",
    );
    const log = openSync(`${root}/.runtime/setup.log`, "a", 0o600);
    const child = spawn(command, args, { stdio: ["ignore", log, log], detached: true });
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
}
