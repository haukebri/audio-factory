import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, statfs } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = fileURLToPath(new URL("./", import.meta.url));
const config = JSON.parse(await readFile(`${root}/config.json`, "utf8"));
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(
  JSON.parse(await readFile(`${root}/config.schema.json`, "utf8")),
);
if (!validate(config)) throw new Error(JSON.stringify(validate.errors));
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command}: exit ${code}`)),
    );
  });
if (process.platform !== "darwin" || process.arch !== "arm64")
  throw new Error("MLX requires macOS Apple Silicon; no automatic backend substitution");
await mkdir(`${root}/.runtime`, { recursive: true });
const disk = await statfs(root);
if (disk.bavail * disk.bsize < 3 * 1024 ** 3) throw new Error("Setup requires 3 GiB free storage");
await run("git", ["--version"]);
await run("uv", ["--version"]);
await run("ffmpeg", ["-version"]);
const checkout = `${root}/.runtime/official-sa3`;
if (!existsSync(checkout)) {
  await run("git", [
    "clone",
    "--filter=blob:none",
    "--sparse",
    "--no-checkout",
    "https://github.com/Stability-AI/stable-audio-3.git",
    checkout,
  ]);
}
await run("git", ["-C", checkout, "fetch", "origin", config.runtime_revision]);
await run("git", ["-C", checkout, "sparse-checkout", "set", "optimized/mlx"]);
await run("git", ["-C", checkout, "checkout", "--detach", config.runtime_revision]);
const python = `${root}/.runtime/mlx-venv/bin/python`;
if (!existsSync(python))
  await run("uv", ["venv", "--python", "3.11.15", `${root}/.runtime/mlx-venv`]);
await run("uv", ["pip", "sync", "--python", python, `${root}/requirements.lock`]);
await run(python, [`${root}/download_models.py`]);
console.log("Ready: pnpm audio:factory start");
