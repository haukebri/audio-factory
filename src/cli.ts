import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GgufBackend } from "./backend.js";
import { Ollama } from "./ollama.js";
import { config, root, sleep, validateRequest } from "./config.js";
import { qaOperation, qaRequest } from "./qa.js";
import { createFactory } from "./service.js";
import { ensureSetup } from "./setup.js";

await mkdir(`${root}/.runtime`, { recursive: true });
try {
  await writeFile(`${root}/.runtime/token`, randomBytes(32).toString("hex"), {
    mode: 0o600,
    flag: "wx",
  });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
}
const token = (await readFile(`${root}/.runtime/token`, "utf8")).trim();
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const url = `http://127.0.0.1:${config.port}`;
const command = process.argv[2];
const health = () =>
  fetch(`${url}/health`, { headers, signal: AbortSignal.timeout(2000) }).then(
    async (r) => ({ ok: r.ok, ...(await r.json()) }),
    () => null,
  );
async function stopped() {
  if (await health())
    throw new Error("Factory is running; finish its session or use stop before a new job");
}
async function stop() {
  const response = await fetch(`${url}/shutdown`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (response && !response.ok) throw new Error(`Stop refused: ${response.status}`);
  const deadline = Date.now() + config.timeout_ms;
  while (await health()) {
    if (Date.now() >= deadline) throw new Error("Factory did not finish shutdown");
    await sleep(100);
  }
}
async function launch() {
  const ollama = new Ollama();
  const backend = new GgufBackend();
  const setup = new AbortController();
  let preparing: Promise<void> | undefined;
  let ready = false;
  let closing: Promise<void> | undefined;
  const shutdown = () =>
    (closing ??= (async () => {
      setup.abort();
      await preparing?.catch(() => {});
      try { await factory.close(); } finally {
        try { await backend.stop(); } finally { await ollama.stop(); }
      }
    })());
  const factory = await createFactory({
    root,
    token,
    backend,
    fresh: true,
    ready: () => ready,
    shutdown: () => {
      void shutdown();
    },
  });
  const interrupt = () => { setup.abort(); void ollama.stop(); void shutdown(); };
  process.once("SIGTERM", interrupt);
  process.once("SIGINT", interrupt);
  try {
    await new Promise<void>((resolve, reject) => {
      factory.server.once("error", reject);
      factory.server.listen(config.port, "127.0.0.1", resolve);
    });
    await ollama.start();
    await (preparing = ensureSetup(true, setup.signal, backend.reserve()));
    setup.signal.throwIfAborted();
    await backend.start();
    setup.signal.throwIfAborted();
    await factory.beginSession();
    ready = true;
    return { shutdown };
  } catch (error) {
    await shutdown();
    throw error;
  }
}
type Report = {
  id: string;
  status: string;
  error?: string;
  delivery?: { audio: string };
  result?: {
    regions?: unknown;
    rhythm?: { suspected: boolean };
    static?: { suspected: boolean };
  };
};
function summary(report: Report) {
  return {
    regions: report.result?.regions,
    rhythmic_warning: report.result?.rhythm?.suspected,
    static_warning: report.result?.static?.suspected,
  };
}
const requestFile = async (path: string) => JSON.parse(await readFile(path, "utf8"));
if (command === "make" || command === "generate" || command === "workflow") {
  if (!process.argv[3]) throw new Error("make requires <request.json> [qa.json]; workflow requires <workflow.json> <idempotency-key>");
  const workflow = command === "workflow" ? await requestFile(process.argv[3]) : null;
  const request = workflow ? workflow.request : await requestFile(process.argv[3]);
  if (!validateRequest(request)) throw new Error(JSON.stringify(validateRequest.errors));
  const qa = workflow ? workflow.qa ?? { clap: workflow.mode === "automatic", ...(workflow.mode === "automatic" ? { target: String((request as { prompt: string }).prompt).slice(0, 200) } : {}) } : process.argv[4]
    ? await requestFile(process.argv[4]) : { clap: false };
  qaRequest("analyses", qa);
  await stopped();
  const modulePath = `${root}/workflow.mjs`;
  const { openJobs } = await import(modulePath);
  const jobs = await openJobs({ root, token });
  const interrupt = () => { void jobs.close(); };
  process.once("SIGTERM", interrupt);
  process.once("SIGINT", interrupt);
  try {
    const job = await jobs.submit(workflow ? process.argv[4] : randomBytes(16).toString("hex"), workflow ?? { request, qa });
    await jobs.wait();
    if (workflow) console.log(JSON.stringify(job));
    if (job.status !== "completed" && !(workflow && job.status === "exhausted")) throw new Error(job.error ?? job.status);
    if (!workflow) console.log(JSON.stringify({ id: job.id, outcome: job.outcome, variants: job.variants, attempts: job.attempts }));
  } finally {
    process.off("SIGTERM", interrupt);
    process.off("SIGINT", interrupt);
    await jobs.close();
  }
} else if (command === "studio") {
  const modulePath = `${root}/studio.mjs`;
  const { createStudio } = await import(modulePath);
  const ollama = new Ollama();
  let studio: Awaited<ReturnType<typeof createStudio>> | undefined;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    void (async () => { try { await studio?.close(); } finally { await ollama.stop(); } })();
  };
  process.once("SIGTERM", interrupt);
  process.once("SIGINT", interrupt);
  try {
    await ollama.start();
    if (!interrupted) studio = await createStudio({ root, token });
    if (interrupted) { await studio?.close(); await ollama.stop(); }
    else console.error("Audio Factory studio ready on http://127.0.0.1:8767; Ctrl-C stops owned work");
  } catch (error) {
    await ollama.stop();
    throw error;
  }
} else if (command === "serve") {
  await launch();
  console.error(`Temporary factory ready on ${url}; stops after ${config.idle_ms / 1000}s idle`);
} else if (command === "start") {
  const existing = await health();
  if (!existing) {
    const log = openSync(`${root}/.runtime/service.log`, "a", 0o600);
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "serve"], {
      detached: true,
      stdio: ["ignore", log, log],
    });
    closeSync(log);
    child.unref();
    const deadline = Date.now() + 90 * 60 * 1000;
    while (!(await health())?.ok) {
      if (child.exitCode !== null || Date.now() > deadline)
        throw new Error("Startup failed; inspect .runtime/service.log and setup.log");
      await sleep(500);
    }
  }
  console.log(JSON.stringify(await health()));
} else if (command === "stop") {
  await stop();
  console.log(JSON.stringify({ status: "stopped" }));
} else if (command === "status") {
  console.log(JSON.stringify((await health()) ?? { status: "stopped" }));
} else if (command === "inspect") {
  const id = process.argv[3];
  if (!id || !/^[a-f0-9]{32}$/.test(id)) throw new Error("inspect requires a run ID");
  console.log(await readFile(`${root}/out/runs/${id}/run.json`, "utf8"));
} else if (command === "analyze" || command === "cut") {
  const id = process.argv[3];
  if (!id || !/^[a-f0-9]{32}$/.test(id)) throw new Error("Expected source run ID");
  await stopped();
  const input =
    command === "cut" && process.argv[5]
      ? { start_seconds: Number(process.argv[4]), end_seconds: Number(process.argv[5]) }
      : process.argv[4]
        ? await requestFile(process.argv[4])
        : {};
  qaRequest(command === "cut" ? "cuts" : "analyses", input);
  await ensureSetup(false);
  const kind = command === "cut" ? "cuts" : "analyses";
  const report: Report = await qaOperation(root, id, kind, input);
  if (report.status !== "completed") throw new Error(JSON.stringify(report));
  console.log(
    JSON.stringify(
      command === "cut"
        ? { id, audio: report.delivery?.audio }
        : {
            id,
            ...summary(report),
            report: `${root}/out/runs/${id}/analyses/${report.id}/report.json`,
          },
    ),
  );
} else if (command === "setup-qa") {
  throw new Error("Semantic QA was removed; setup prepares local generation and signal tools");
} else if (command === "setup") {
  await stopped();
  const backend = new GgufBackend();
  try {
    await ensureSetup(true, undefined, backend.reserve());
    await backend.start();
  } finally { await backend.stop(); }
  console.log(JSON.stringify({ provider: "local", status: "ready" }));
} else if (command === "retain") {
  await stopped();
  const file = "retain.mjs";
  const result = spawnSync(
    process.execPath,
    [`${root}/${file}`, ...process.argv.slice(3)],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} else {
  throw new Error(
    "Usage: audio:factory make <request.json> [qa.json]|workflow <workflow.json> <idempotency-key>|analyze <id> [qa.json]|cut <id> [cut.json | start end]|retain <audio-path>|studio|status|start|stop|setup|setup-qa|inspect <id>",
  );
}
