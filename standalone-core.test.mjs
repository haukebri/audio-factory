import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const isolated = realpathSync(mkdtempSync(join(tmpdir(), "audio-factory-core-")));
console.log(`Isolated copy: ${isolated}`);
const run = (command, args, cwd = isolated) => {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "", CI: "true" },
    encoding: "utf8",
    timeout: 120000,
  });
  assert.ifError(result.error);
  return result;
};
try {
  const files = ["run", "src", "package.json", "pnpm-lock.yaml", "tsconfig.json",
    "config.json", "qa-config.json", "qa-model.lock.json", "requirements.lock", "signal-requirements.lock",
    "setup.mjs", "download_models.py",
    "qa.py", "prompt-plan.mjs", "docs/tasks/m02/clap-m1-baseline.lock.json", "bundle.mjs", "loop-audio.mjs", "export-lineage.mjs", "retain.mjs", "workflow.mjs", "batches.mjs", "studio.mjs", "studio.html", "studio.css", "studio.js", "review-store.mjs",
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
    import { openJobs } from './workflow.mjs';
    import { createStudio } from './studio.mjs';
    assert.equal(typeof openJobs, 'function');
    assert.equal(typeof createStudio, 'function');
    assert.equal(typeof createFactory, 'function');
    assert.equal(config.steps, 8);
    assert.ok(validateRequest({prompt: 'A dry knock'}));
    assert.ok(!validateRequest({prompt: ''}));
    assert.throws(() => verifyExport({}, Buffer.alloc(0)), /Invalid export lineage/);
  `]);
  assert.equal(imports.status, 0, imports.stdout + imports.stderr);
  assert.ok(!existsSync(join(isolated, ".runtime")));
  // Exercise first-use bootstrap independently of the explicit installation above.
  rmSync(join(isolated, "node_modules"), { recursive: true });
  rmSync(join(isolated, "dist"), { recursive: true });
  const status = run(join(isolated, "run"), ["status"], tmpdir());
  assert.equal(status.status, 0, status.stdout + status.stderr);
  assert.match(status.stdout, /"status":"stopped"/);
  assert.ok(existsSync(join(isolated, "dist/cli.js")));
  assert.equal(readFileSync(join(isolated, "pnpm-lock.yaml"), "utf8"), readFileSync(join(root, "pnpm-lock.yaml"), "utf8"));
  console.log(status.stdout.trim());
  assert.deepEqual(readdirSync(join(isolated, ".runtime")), ["token"]);
  assert.ok(!existsSync(join(isolated, "out")));
  mkdirSync(join(isolated, "out"));
  writeFileSync(join(isolated, "out/sentinel"), "preserve existing output");
  const invalidRequest = join(isolated, "invalid request.json");
  writeFileSync(invalidRequest, JSON.stringify({ prompt: "" }));
  for (const [command, request, error] of [
    ["make", join(isolated, "nonexistent request.json"), /ENOENT/],
    ["generate", invalidRequest, /minLength/],
  ]) {
    const result = run(join(isolated, "run"), [command, request], tmpdir());
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, error);
    assert.deepEqual(readdirSync(join(isolated, ".runtime")), ["token"]);
    assert.deepEqual(readdirSync(join(isolated, "out")), ["sentinel"]);
    assert.equal(readFileSync(join(isolated, "out/sentinel"), "utf8"), "preserve existing output");
  }
  rmSync(join(isolated, "out"), { recursive: true });
  for (const command of ["invalid-command", "import"]) {
    const usage = run(process.execPath, [...permissions, `--allow-fs-write=${isolated}`, "dist/cli.js", command]);
    assert.equal(usage.status, 1, usage.stdout + usage.stderr);
    assert.doesNotMatch(usage.stderr, /\|import |ERR_ACCESS_DENIED/);
    assert.deepEqual(readdirSync(join(isolated, ".runtime")), ["token"]);
    assert.ok(!existsSync(join(isolated, "out")));
  }
  console.log("PASS: isolated imports, schema validation, local dependencies and unsupported CLI usage; no setup or service output.");
} finally {
  rmSync(isolated, { recursive: true, force: true });
  console.log(`Removed isolated copy: ${isolated}`);
}
