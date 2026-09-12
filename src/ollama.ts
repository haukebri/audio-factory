import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { root, sleep } from "./config.js";

// Own only the daemon we spawn; an existing Ollama may serve other applications.
export class Ollama {
  private child?: ChildProcess;
  private exited?: Promise<void>;
  private stopping?: Promise<void>;
  private controller = new AbortController();

  async start() {
    const models = async () => {
      const response = await fetch("http://127.0.0.1:11434/api/tags", {
        signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(2000)]),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      return await response.json() as { models: { name: string }[] };
    };
    try {
      let available = await models().catch(error => {
        if (error.cause?.code !== "ECONNREFUSED") throw error;
        return null;
      });
      if (!available) {
        this.controller.signal.throwIfAborted();
        const logPath = `${root}/.runtime/ollama.log`;
        const log = openSync(logPath, "a", 0o600);
        try {
          this.child = spawn("ollama", ["serve"], {
            env: { ...process.env, OLLAMA_HOST: "127.0.0.1:11434" },
            stdio: ["ignore", log, log],
          });
        } finally { closeSync(log); }
        let failure: Error | undefined;
        this.exited = new Promise(resolve => {
          this.child!.once("error", error => { failure = error; resolve(); });
          this.child!.once("exit", () => { failure ??= new Error(`Ollama exited; inspect ${logPath}`); resolve(); });
        });
        const deadline = Date.now() + 60000;
        while (!available) {
          this.controller.signal.throwIfAborted();
          if (failure) throw failure;
          if (Date.now() >= deadline) throw new Error(`Ollama startup timed out; inspect ${logPath}`);
          available = await models().catch(() => null);
          if (!available) await sleep(200);
        }
        if (failure) throw failure;
      }
      this.controller.signal.throwIfAborted();
      if (!available.models.some(model => model.name === "gemma4:latest"))
        throw new Error("Ollama requires gemma4:latest; run: ollama pull gemma4:latest");
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  stop() {
    this.controller.abort();
    return this.stopping ??= (async () => {
      const child = this.child;
      if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      try { await this.exited; } finally { clearTimeout(timer); }
    })();
  }
}
