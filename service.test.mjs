import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFactory } from "./dist/service.js";
import { wavFixture as wav } from "./wav-fixture.mjs";

test("WAV generation preserves idempotency, failures, disconnects and restart evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "audio-factory-"));
  console.log(`Service fixture: ${root}`);
  let count = 0;
  let release;
  let fail = false;
  const backend = {
    async generate() {
      count++;
      await new Promise((resolve) => {
        release = resolve;
      });
      if (fail) throw new Error("controlled backend failure");
      return wav();
    },
    async reset() {},
    async unload() {},
  };
  const factory = await createFactory({ root, token: "test", backend });
  await new Promise((resolve) => factory.server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${factory.server.address().port}`;
  const headers = { Authorization: "Bearer test", "Content-Type": "application/json" };
  const post = (key, body, signal) =>
    fetch(`${url}/v1/sound-effects`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": key },
      body: JSON.stringify(body),
      signal,
    });
  const request = { prompt: "A dry impact", duration_seconds: 1, seed: 42 };
  const wait = async (condition) => {
    for (let i = 0; i < 100 && !condition(); i++) await new Promise((r) => setTimeout(r, 10));
    assert.ok(condition());
  };
  try {
    assert.equal((await fetch(`${url}/health`)).status, 401);
    assert.equal((await fetch(`${url}/health`, { headers: { Authorization: "Bearer wrong" } })).status, 401);
    assert.equal((await fetch(`${url}/health`, { headers: { ...headers, Origin: "http://localhost" } })).status, 403);
    for (const input of [{}, { prompt: " " }, { ...request, prompt: "x".repeat(2001) },
      { ...request, duration_seconds: 0.49 }, { ...request, duration_seconds: 60.01 },
      { ...request, seed: -1 }, { ...request, seed: 2147483648 }, { ...request, seed: 1.5 }]) {
      assert.equal((await post("bad", input)).status, 400);
    }
    for (const [type, body, status] of [["text/plain", "{}", 415], ["application/json", "{", 400]]) {
      assert.equal((await fetch(`${url}/v1/sound-effects`, {
        method: "POST", headers: { ...headers, "Content-Type": type }, body,
      })).status, status);
    }
    assert.equal((await post("bad", { ...request, output: "/tmp/arbitrary" })).status, 400);
    assert.equal((await post("oversized", { prompt: "x".repeat(20000) })).status, 413);
    const pending = post("first", request);
    pending.catch(() => {}); // Cleanup can close this response after an assertion fails.
    await wait(() => count === 1);
    assert.equal((await post("busy", request)).status, 429);
    assert.equal((await post("first", { ...request, prompt: "different" })).status, 409);
    assert.equal((await fetch(`${url}/health`, { headers })).status, 200);
    release();
    const first = await pending;
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("content-type"), "audio/wav");
    assert.deepEqual(Buffer.from(await first.arrayBuffer()), wav());
    const id = first.headers.get("x-run-id");
    assert.equal((await post("first", request)).status, 200);
    assert.equal(count, 1);
    const record = await (await fetch(`${url}/v1/runs/${id}`, { headers })).json();
    assert.equal(record.status, "completed");
    assert.equal(record.request.seed, 42);
    assert.equal(record.runtime.backend, "metal");
    assert.equal(record.audio.sample_rate, 44100);
    assert.equal(record.models.length, 5);
    assert.deepEqual(await readFile(join(root, "out", "runs", id, "audio.wav")), wav());
    fail = true;
    const failure = post("failure", request);
    failure.catch(() => {});
    await wait(() => count === 2);
    release();
    assert.equal((await failure).status, 502);
    assert.equal((await post("failure", request)).status, 409);
    fail = false;
    const abort = new AbortController();
    const detached = post("disconnected", request, abort.signal).catch(() => undefined);
    await wait(() => count === 3);
    abort.abort();
    release();
    await detached;
    await wait(() => !factory.busy());
    assert.equal((await post("disconnected", request)).status, 200);
    assert.equal(count, 3);
    const draining = post("draining", request).catch(() => undefined);
    await wait(() => count === 4);
    let closed = false;
    const closing = factory.close().then(() => { closed = true; });
    assert.equal((await post("after-close", request)).status, 503);
    assert.equal(closed, false);
    release();
    await closing;
    await draining;
    assert.equal(factory.busy(), false);
    assert.equal(factory.server.listening, false);
    const { hash } = await import("./dist/config.js");
    const drained = JSON.parse(await readFile(join(root, "out", "runs", hash("draining").slice(0, 32), "run.json")));
    assert.equal(drained.status, "completed");
    record.status = "generating";
    await writeFile(join(root, "out", "runs", id, "run.json"), JSON.stringify(record));
    await mkdir(join(root, "out", "runs", "0".repeat(32)));
    const restarted = await createFactory({ root, token: "test", backend });
    const recovered = JSON.parse(await readFile(join(root, "out", "runs", id, "run.json")));
    assert.equal(recovered.status, "interrupted");
    assert.match(recovered.error, /new idempotency key/);
    assert.deepEqual(await readFile(join(root, "out", "runs", id, "audio.wav")), wav());
    await restarted.close();
  } finally {
    release?.();
    await factory.close();
    assert.equal(factory.server.listening, false);
    await rm(root, { recursive: true, force: true });
    console.log(`Removed fixture: ${root}`);
  }
});

test("orphan recovery verifies process identity before sending any signal", async () => {
  const { spawn } = await import("node:child_process");
  const { processIdentity, stopOwned } = await import("./dist/ownership.js");
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  await new Promise((resolve) => child.once("spawn", resolve));
  try {
    const identity = processIdentity(child.pid);
    assert.ok(identity);
    assert.equal(await stopOwned({ pid: child.pid, identity: "different owner" }), false);
    assert.equal(child.exitCode, null);
    assert.equal(await stopOwned({ pid: child.pid, identity }), true);
    assert.equal(processIdentity(child.pid), undefined);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    assert.equal(processIdentity(child.pid), undefined);
  }
});

test("a new owned session clears only disposable output and idle sessions stop", async () => {
  const { config } = await import("./dist/config.js");
  const { access } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "audio-factory-session-"));
  await mkdir(join(root, "out"));
  await mkdir(join(root, ".runtime", "retained"), { recursive: true });
  await writeFile(join(root, "out", "old.wav"), "temporary");
  await writeFile(join(root, ".runtime", "cache"), "keep");
  await writeFile(join(root, ".runtime", "retained", "sentinel"), "retained");
  let stopped;
  const previousIdle = config.idle_ms;
  const backend = {
    async generate() {
      return wav();
    },
    async reset() {},
    async unload() {},
  };
  const factory = await createFactory({
    root,
    token: "test",
    backend,
    fresh: true,
    shutdown: () => {
      stopped ??= factory.close();
    },
  });
  try {
    await assert.rejects(factory.beginSession(), /owned idle listening socket/);
    await access(join(root, "out", "old.wav"));
    await new Promise((resolve) => factory.server.listen(0, "127.0.0.1", resolve));
    await factory.beginSession();
    await assert.rejects(access(join(root, "out", "old.wav")));
    assert.equal(await readFile(join(root, ".runtime", "cache"), "utf8"), "keep");
    config.idle_ms = 1;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.ok(stopped);
    await stopped;
    assert.equal(factory.server.listening, false);
    assert.equal(await readFile(join(root, ".runtime", "retained", "sentinel"), "utf8"), "retained");
  } finally {
    config.idle_ms = previousIdle;
    await factory.close();
    await rm(root, { recursive: true, force: true });
    console.log(`Removed fixture: ${root}`);
  }
});

test("CLI port contention and failed local setup preserve the prior session and unrelated owner", async () => {
  const { spawn, spawnSync } = await import("node:child_process");
  const { cp, readdir, symlink } = await import("node:fs/promises");
  const { once } = await import("node:events");
  const { fileURLToPath } = await import("node:url");
  const { processIdentity } = await import("./dist/ownership.js");
  const source = fileURLToPath(new URL("./", import.meta.url));
  const root = await mkdtemp(join(tmpdir(), "audio-factory-startup-"));
  console.log(`Startup fixture: ${root}`);
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { createServer } from 'node:http';
    const server = createServer((req, res) => res.end('unrelated listener'));
    server.listen(0, '127.0.0.1', () => process.send(server.address().port));
  `], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  const exited = once(child, "exit");
  try {
    const [port] = await once(child, "message");
    const identity = processIdentity(child.pid);
    assert.ok(identity);
    for (const name of ["dist", "config.json", "qa-config.json",
      ...(await readdir(source)).filter((name) => name.endsWith(".schema.json"))]) {
      await cp(join(source, name), join(root, name), { recursive: true });
    }
    await symlink(join(source, "node_modules"), join(root, "node_modules"), "dir");
    const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
    config.port = port;
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    await mkdir(join(root, "out"));
    await mkdir(join(root, ".runtime", "retained"), { recursive: true });
    const sentinels = ["out/old.wav", ".runtime/cache", ".runtime/retained/sentinel"];
    for (const path of sentinels) await writeFile(join(root, path), path);
    await writeFile(join(root, ".runtime/backend-owner.json"), JSON.stringify({ pid: child.pid, identity: "different owner" }));
    const launch = () => spawnSync(process.execPath, [join(root, "dist/cli.js"), "serve"], {
      cwd: root, encoding: "utf8", timeout: 15000,
      env: { ...process.env, ELEVEN_KEY: "", NODE_PATH: "", NODE_OPTIONS: "" },
    });
    const contention = launch();
    assert.ifError(contention.error);
    assert.equal(contention.status, 1);
    assert.match(contention.stderr, /EADDRINUSE/);
    assert.equal(await readFile(join(root, "out/old.wav"), "utf8"), "out/old.wav");
    assert.equal(processIdentity(child.pid), identity);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), "unrelated listener");
    await assert.rejects(readFile(join(root, ".runtime/setup.log")), { code: "ENOENT" });
    const { createServer } = await import("node:net");
    const reservation = createServer();
    await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
    config.port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    const failed = launch();
    assert.ifError(failed.error);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /Setup failed/);
    assert.equal(processIdentity(failed.pid), undefined);
    for (const path of sentinels) assert.equal(await readFile(join(root, path), "utf8"), path);
    assert.equal(processIdentity(child.pid), identity);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), "unrelated listener");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
    assert.equal(processIdentity(child.pid), undefined);
    await rm(root, { recursive: true, force: true });
    console.log(`Removed startup fixture: ${root}`);
  }
});
