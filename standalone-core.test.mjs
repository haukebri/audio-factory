import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const isolated = realpathSync(mkdtempSync(join(tmpdir(), "audio-factory-core-")));
console.log(`Isolated copy: ${isolated}`);
const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: isolated,
    env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "", CI: "true" },
    encoding: "utf8",
    timeout: 120000,
  });
  assert.ifError(result.error);
  return result;
};
try {
  const files = ["src", "package.json", "pnpm-lock.yaml", "tsconfig.json",
    "config.json", "qa-config.json", "qa-model.lock.json", "requirements.lock",
    "qa-requirements.lock", "setup.mjs", "download_models.py", "qa-setup.py",
    "qa.py", "bundle.mjs", "export-lineage.mjs", "retain.mjs",
    ...readdirSync(root).filter((name) => name.endsWith(".schema.json"))];
  for (const file of files) cpSync(join(root, file), join(isolated, file), { recursive: true });
  for (const args of [["install", "--frozen-lockfile"], ["build"]]) {
    const result = run("pnpm", args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    console.log(result.stdout.trim());
  }
  assert.equal(readFileSync(join(isolated, "pnpm-lock.yaml"), "utf8"), readFileSync(join(root, "pnpm-lock.yaml"), "utf8"));
  for (const entry of readdirSync(isolated, { recursive: true })) {
    const path = join(isolated, entry);
    assert.ok(realpathSync(path).startsWith(`${isolated}/`), `External symlink: ${path}`);
    if (/^(src|dist)\//.test(entry) || /\.mjs$/.test(entry) && !entry.startsWith("node_modules/")) {
      assert.doesNotMatch(readFileSync(path, "utf8"), /packages\/content-schema|urban-wildlife|attack-feedback|game-audio|import\.mjs/);
    }
  }
  const permissions = ["--permission", `--allow-fs-read=${isolated}`];
  const imports = run(process.execPath, [...permissions, "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { config, validateRequest } from './dist/config.js';
    import { createFactory } from './dist/service.js';
    import { verifyExport } from './export-lineage.mjs';
    assert.equal(typeof createFactory, 'function');
    assert.equal(config.steps, 8);
    assert.ok(validateRequest({prompt: 'A dry knock'}));
    assert.ok(!validateRequest({prompt: ''}));
    assert.throws(() => verifyExport({}, Buffer.alloc(0)), /Invalid export lineage/);
  `]);
  assert.equal(imports.status, 0, imports.stdout + imports.stderr);
  assert.ok(!existsSync(join(isolated, ".runtime")));
  for (const command of ["invalid-command", "import"]) {
    const usage = run(process.execPath, [...permissions, `--allow-fs-write=${isolated}`, "dist/cli.js", command]);
    assert.equal(usage.status, 1, usage.stdout + usage.stderr);
    assert.match(usage.stderr, /Usage: audio:factory make/);
    assert.doesNotMatch(usage.stderr, /\|import |ERR_ACCESS_DENIED/);
    assert.deepEqual(readdirSync(join(isolated, ".runtime")), ["token"]);
    assert.ok(!existsSync(join(isolated, "out")));
  }
  console.log("PASS: isolated imports, schema validation, local dependencies and unsupported CLI usage; no setup or service output.");
} finally {
  rmSync(isolated, { recursive: true, force: true });
  console.log(`Removed isolated copy: ${isolated}`);
}
