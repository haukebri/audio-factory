import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, stat, statfs, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = fileURLToPath(new URL("./", import.meta.url));
const config = JSON.parse(await readFile(`${root}/config.json`, "utf8"));
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(
  JSON.parse(await readFile(`${root}/config.schema.json`, "utf8")),
);
if (!validate(config)) throw new Error(JSON.stringify(validate.errors));
const checkout = `${root}/.runtime/sa3-gguf`;
const git = args => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" }).trim();
async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
function verifySource() {
  if (git(["rev-parse", "HEAD"]) !== config.runtime_revision ||
      git(["-C", "ggml", "rev-parse", "HEAD"]) !== config.ggml_revision ||
      git(["status", "--porcelain", "--untracked-files=no"]) ||
      git(["-C", "ggml", "status", "--porcelain", "--untracked-files=no"]))
    throw new Error("GGUF source/submodule revision or tracked files mismatch; preserved for repair");
}
export async function verifyGeneration() {
  verifySource();
  const manifest = JSON.parse(await readFile(`${checkout}/build-manifest.json`, "utf8"));
  if (manifest.revision !== config.runtime_revision || manifest.ggml_revision !== config.ggml_revision || manifest.backend !== "metal")
    throw new Error("GGUF build manifest mismatch; run setup");
  for (const name of ["sa3-generate", "sa3-smoke"])
    if (await digest(`${checkout}/build-metal/bin/${name}`) !== manifest.binaries[name])
      throw new Error(`GGUF binary mismatch: ${name}; run setup`);
  for (const model of config.models) {
    const path = `${checkout}/models/${model.file}`;
    if ((await stat(path)).size !== model.bytes || await digest(path) !== model.sha256)
      throw new Error(`Model mismatch; preserved without replacement: ${model.file}`);
  }
  return manifest;
}
async function setup() {
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("Medium GGUF requires macOS Apple Silicon Metal; no automatic backend substitution");
  await mkdir(`${root}/.runtime`, { recursive: true });
  const env = { ...process.env };
  if (!env.DEVELOPER_DIR && existsSync("/Applications/Xcode.app/Contents/Developer"))
    env.DEVELOPER_DIR = "/Applications/Xcode.app/Contents/Developer";
  const run = (command, args, timeout = 30 * 60 * 1000) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit", timeout, killSignal: "SIGKILL" });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command}: exit ${code ?? signal}`)));
  });
  const disk = await statfs(root);
  const missing = config.models.filter(m => !existsSync(`${checkout}/models/${m.file}`)).reduce((n,m) => n + m.bytes, 0);
  if (disk.bavail * disk.bsize < missing + 5 * 1024 ** 3)
    throw new Error(`Setup requires ${missing} model bytes plus 5 GiB build/cache reserve`);
  for (const [command, args] of [["git", ["--version"]], ["uv", ["--version"]], ["ffmpeg", ["-version"]], ["xcrun", ["--find", "clang"]], ["xcrun", ["--find", "metal"]]])
    await run(command, args, 30000);
  if (!existsSync(checkout)) {
    await run("git", ["clone", "--no-checkout", "https://github.com/betweentwomidnights/sa3.cpp.git", checkout]);
    await run("git", ["-C", checkout, "checkout", "--detach", config.runtime_revision]);
    await run("git", ["-C", checkout, "submodule", "update", "--init", "--recursive"]);
  }
  verifySource();
  const signalPython = `${root}/.runtime/signal-venv/bin/python`;
  if (!existsSync(signalPython)) await run("uv", ["venv", "--python", "3.11.15", `${root}/.runtime/signal-venv`]);
  await run("uv", ["pip", "sync", "--python", signalPython, `${root}/signal-requirements.lock`]);
  const python = `${root}/.runtime/gguf-build-venv/bin/python`;
  if (!existsSync(python)) await run("uv", ["venv", "--python", "3.11.15", `${root}/.runtime/gguf-build-venv`]);
  await run("uv", ["pip", "install", "--python", python, "cmake==4.1.0"]);
  const cmake = `${root}/.runtime/gguf-build-venv/bin/cmake`;
  await run(cmake, ["-S", checkout, "-B", `${checkout}/build-metal`, "-DSA3_METAL=ON", "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_SHARED_LIBS=OFF"]);
  await run(cmake, ["--build", `${checkout}/build-metal`, "--target", "sa3-generate", "sa3-smoke", "-j", "8"]);
  await run("python3", [`${root}/download_models.py`], 60 * 60 * 1000);
  const binaries = {};
  for (const name of ["sa3-generate", "sa3-smoke"]) binaries[name] = await digest(`${checkout}/build-metal/bin/${name}`);
  const manifest = { revision: config.runtime_revision, ggml_revision: config.ggml_revision, backend: "metal", cmake: "4.1.0", build: "Release; SA3_METAL=ON; BUILD_SHARED_LIBS=OFF", binaries };
  await writeFile(`${checkout}/build-manifest.json.tmp`, JSON.stringify(manifest, null, 2) + "\n");
  await rename(`${checkout}/build-manifest.json.tmp`, `${checkout}/build-manifest.json`);
  await verifyGeneration();
  const devices = execFileSync(`${checkout}/build-metal/bin/sa3-smoke`, { env, encoding: "utf8", timeout: 120000 });
  if (!/GPU\s+MTL\d+\s+Apple/.test(devices)) throw new Error("Apple Metal device unavailable; no CPU fallback");
  console.log(devices);
  console.log("Verified Medium F16 generation setup; local inference checks the selected Metal backend.");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { acquireCompute, recoverBackend } = await import('./dist/ownership.js');
  const claim = acquireCompute(process.env.AUDIO_FACTORY_COMPUTE_CLAIM);
  try { await recoverBackend(); await setup(); } finally { claim.release(); }
}
