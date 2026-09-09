import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MlxBackend } from "./backend.js";
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
async function launch(qa = false) {
  const backend = new MlxBackend();
  const setup = new AbortController();
  let ready = false;
  let closing: Promise<void> | undefined;
  const shutdown = () =>
    (closing ??= (async () => {
      setup.abort();
      await factory.close();
      await backend.stop();
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
  try {
    await new Promise<void>((resolve, reject) => {
      factory.server.once("error", reject);
      factory.server.listen(config.port, "127.0.0.1", resolve);
    });
    await ensureSetup(qa, setup.signal);
    setup.signal.throwIfAborted();
    await backend.start();
    setup.signal.throwIfAborted();
    await factory.beginSession();
    ready = true;
    const interrupt = () => {
      void shutdown();
    };
    process.once("SIGTERM", interrupt);
    process.once("SIGINT", interrupt);
    return { shutdown };
  } catch (error) {
    await shutdown();
    throw error;
  }
}
async function post(path: string, value: unknown, extra: Record<string, string> = {}) {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { ...headers, ...extra },
    body: JSON.stringify(value),
    signal: AbortSignal.timeout(config.timeout_ms),
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response;
}
type Report = {
  id: string;
  status: string;
  error?: string;
  delivery?: { audio: string };
  result?: {
    regions?: unknown;
    rhythm?: { suspected: boolean };
    clap?: { status: string; error?: string; scores?: { ranking: unknown }[] };
  };
};
function summary(report: Report) {
  return {
    regions: report.result?.regions,
    rhythmic_warning: report.result?.rhythm?.suspected,
    clap: {
      status: report.result?.clap?.status,
      error: report.result?.clap?.error,
      ranking: report.result?.clap?.scores?.[0]?.ranking,
    },
  };
}
const requestFile = async (path: string) => JSON.parse(await readFile(path, "utf8"));
if (command === "make" || command === "generate") {
  if (!process.argv[3]) throw new Error("make requires <request.json> [qa.json]");
  const request = await requestFile(process.argv[3]);
  if (!validateRequest(request)) throw new Error(JSON.stringify(validateRequest.errors));
  const qa = process.argv[4]
    ? await requestFile(process.argv[4])
    : {
        clap: true,
        target: String((request as { prompt: string }).prompt).slice(0, 200),
        alternatives: ["Radio static noise", "A helicopter flying", "Silence"],
      };
  qaRequest("analyses", qa);
  await stopped();
  const service = await launch(qa.clap === true);
  try {
    const response = await post("/v1/sound-effects", request, { "Idempotency-Key": randomUUID() });
    const id = response.headers.get("x-run-id");
    await response.arrayBuffer();
    const analysis: Report = await (await post(`/v1/runs/${id}/analyses`, qa)).json();
    const cutResponse = await post(`/v1/runs/${id}/cuts`, {});
    await cutResponse.arrayBuffer();
    const location = cutResponse.headers.get("location");
    if (!location?.startsWith(`/v1/runs/${id}/cuts/`))
      throw new Error("Invalid cut metadata location");
    const cut: Report = await (await fetch(`${url}${location}`, { headers })).json();
    if (!cut.delivery?.audio) throw new Error("Factory did not prepare an export");
    console.log(
      JSON.stringify({
        id,
        audio: cut.delivery.audio,
        qa: summary(analysis),
        report: `${root}/out/runs/${id}/analyses/${analysis.id}/report.json`,
      }),
    );
  } finally {
    await service.shutdown();
  }
} else if (command === "serve") {
  await launch(true);
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
    const deadline = Date.now() + 20 * 60 * 1000;
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
  await ensureSetup(input.clap === true);
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
} else if (
  command === "retain" ||
  command === "setup" ||
  command === "setup-qa"
) {
  await stopped();
  const file =
    command === "retain" ? "retain.mjs" : command === "setup" ? "setup.mjs" : "qa-setup.py";
  const result = spawnSync(
    command === "setup-qa" ? "python3" : process.execPath,
    [`${root}/${file}`, ...process.argv.slice(3)],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} else {
  throw new Error(
    "Usage: audio:factory make <request.json> [qa.json]|analyze <id> [qa.json]|cut <id> [cut.json | start end]|retain <audio-path>|status|start|stop|setup|setup-qa|inspect <id>",
  );
}
