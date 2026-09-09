# Milestone 1 — Standalone core

Status: planned. Dependency: documentation baseline in [project overview](../project-overview.md).

## Outcome

The existing factory builds in this repository without the Urban Wildlife workspace. Its generation backend and audio behavior remain unchanged.

## Work

1. Record source revision, worktree differences and hashes for the files actually copied. Use the current working factory, not a reconstruction from the historical slice. Leave source files and existing destination task runners untouched.
2. Copy the core TypeScript implementation, schemas/configs, pinned Python locks, setup/download scripts, signal/CLAP tools, export bundle validator and retention helper into the tool root. Follow the overview's extraction boundary; omit game assets and operational state.
3. Add the smallest standalone ESM package manifest, frozen pnpm lockfile and TypeScript configuration. Reuse source dependency versions, declare Ajv directly, and replace imports that reach through the game's content-schema package. Do not copy the monorepo or upgrade dependencies as part of extraction.
4. Make the launcher and build/test/smoke scripts root-local. Preserve the `audio:factory` command family and use `./run` as the root launcher. Fix diagnostics that still point at the old factory path.
5. Remove the game import command and its game-pack dependencies. Preserve `make`, its `generate` alias, setup, status/start/stop, inspect/analyze/cut and retain.
6. Add ignore rules for dependencies, build outputs, temporary audio, runtime state, model files and local machine artifacts. Keep schema identifiers and pinned inference settings unchanged.

## Preflight and recovery

Read destination status before copying; do not overwrite unrelated work. Verify source access and Node/pnpm availability. This milestone needs no model downloads or running service. Stage only selected source files; if the build fails, fix the standalone imports/configuration rather than reaching back into the game. Keep the source inventory sufficient to repeat the copy without importing caches or secrets.

## Acceptance evidence

- [ ] Standalone frozen dependency installation and TypeScript build pass.
- [ ] Core modules resolve with the source project unavailable to the process; no symlink or absolute path supplies a hidden dependency.
- [ ] A focused search and import inspection find no required game workspace, content-schema package path or game asset builder.
- [ ] The root launcher reaches the standalone CLI; invalid usage reports its supported commands without starting inference.
- [ ] Copied configuration, locks and model hashes match the recorded source, except documented path/package adaptations.
- [ ] Git's candidate file list excludes caches, tokens, PID files, audio history, weights and build products.

Record commands, results and the copied-file inventory in this milestone when implemented. A successful build proves packaging only; real inference belongs to milestone 3.

## Runner tasks

Execute in the global order in [the task queue](../tasks/m01/00-overview.md); task status is authoritative for execution.

- [01 — Extract a buildable standalone core](../tasks/m01/01-standalone-core.md)
- [02 — Wire the root launcher and setup paths](../tasks/m01/02-launcher-and-setup.md)
