# 01 — Extract a buildable standalone core

Status: [ ] Not started

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [01](../../milestone/01-standalone-core.md)
Depends on: None; begin with the documentation baseline.
Expected duration: 20–40 minutes.

## Outcome

Copy the working core into this repository and make it compile without the game workspace. This is one atomic packaging change; splitting the mutually dependent runtime modules into broken intermediate commits would not be useful.

## Work and scope

Read the source factory's `src/`, schemas/config, setup/download and QA scripts, bundle/lineage and retain helpers, plus the source root package manifest/lockfile and TypeScript base configuration. Record source HEAD, relevant worktree differences, and SHA-256 hashes of every copied source file in `docs/source-inventory.md`; distinguish original bytes from adapted destination bytes.

Copy those core files to the repository root layout. Add the minimal standalone ESM `package.json`, frozen pnpm lockfile and TypeScript configuration using source versions and direct Ajv resolution. Preserve runtime/model pins, Python locks, schema IDs and audio settings. Include all runtime helper files reached by the copied CLI; leave the launcher adaptation to task 02.

Remove the CLI's game-specific `import` branch/help and omit the game importer, asset builders, loop conversion, game browser checks, pilot audio and operational state. Add ignore rules before generating dependencies/build outputs, including `.DS_Store`, Python bytecode, `.runtime/`, `out/`, weights and local test artifacts. Preserve existing `scripts/` and documentation. Add `build` and `audio:factory` package scripts; no placeholder scripts for later tasks.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- `pnpm install --frozen-lockfile` and `pnpm build` pass using the standalone package.
- Import the compiled configuration/service and lineage validator from an isolated copy containing only this project's required files and installed dependencies. Inspect its imports: no source-project symlink, absolute workspace path or `packages/content-schema/node_modules` reference may provide dependencies. Do not rename the original game directory to prove isolation.
- Verify copied pins/locks/schema IDs against the inventory and explain each adaptation. Check the prospective Git file list excludes runtime/private/generated files.
- The compiled CLI reports supported usage for an invalid command without launching a service or downloading models.

## Preflight and recovery

Preflight source read access, Node/pnpm and registry access. Do not reset the source worktree or overwrite unrelated destination files. Copy selected files only; retry package installation with the same lockfile. No inference, model downloads or game changes in this task.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Not run. Record commands and outcomes, input revision/hashes, relevant artifact locations, external mutations and recovery state here during implementation. Distinguish mandatory, inherited and best-effort evidence. Leave Status unchecked if a mandatory check is missing or failed.
