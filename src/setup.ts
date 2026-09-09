import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { config, root } from "./config.js";

export async function ensureSetup(qa = false, signal?: AbortSignal) {
  const modelRoot = `${root}/.runtime/official-sa3/optimized/mlx/models/mlx`;
  const commands: [string, string[]][] = [];
  if (
    !existsSync(`${root}/.runtime/mlx-venv/bin/python`) ||
    config.models.some((m) => !existsSync(`${modelRoot}/${m.file}`))
  )
    commands.push([process.execPath, [`${root}/setup.mjs`]]);
  if (qa) {
    let installed = existsSync(`${root}/.runtime/qa-venv/bin/python`);
    try {
      const manifest = JSON.parse(await readFile(`${root}/.runtime/qa-model.json`, "utf8"));
      installed &&= manifest.files.every((file: { path: string }) => existsSync(file.path));
    } catch {
      installed = false;
    }
    if (!installed) commands.push(["python3", [`${root}/qa-setup.py`]]);
  }
  for (const [command, args] of commands) {
    signal?.throwIfAborted();
    console.error(
      "Preparing local audio factory; progress: .runtime/setup.log",
    );
    const log = openSync(`${root}/.runtime/setup.log`, "a", 0o600);
    const child = spawn(command, args, { stdio: ["ignore", log, log], detached: true });
    closeSync(log);
    const stop = () => {
      if (child.pid && child.exitCode === null) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {}
      }
    };
    signal?.addEventListener("abort", stop, { once: true });
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    const timer = setTimeout(stop, 20 * 60 * 1000);
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
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    }
  }
}
