# 01 — Extract a buildable standalone core

Status: [x] Complete

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

Completed 2026-09-09. Input identity and all original/adapted SHA-256 pairs: [source inventory](../../source-inventory.md). Source HEAD remains `00d64d6cbf71bf0f9d35832784d7a9aa3ffe35aa`; copied inputs match HEAD. The three dirty source factory game-check files were excluded. No destination/ancestor AGENTS.md file was present; the supplied working agreements were followed. Existing task runners and README are unchanged.

Mandatory checks:

- Preflight: source reads succeeded; `node --version` reported `v22.22.3`; initial `pnpm --version` reported `10.30.3`. The standalone manifest selects the source `pnpm@9.15.9`, used successfully for installs/builds. `curl -I --max-time 30 https://registry.npmjs.org/ajv` returned HTTP 200.
- `pnpm install --frozen-lockfile` passed with nine installed packages, all reused from cache, no lockfile resolution/update. `pnpm build` passed.
- `node standalone-core.test.mjs` passed. This runnable packaging check copies only required project files into a disposable directory, installs frozen dependencies independently, builds, verifies every resolved filesystem path stays inside that copy, and searches compiled/source imports for game dependencies. Node `--permission --allow-fs-read=<isolated-copy>` successfully imported compiled config/service and the lineage validator; child processes are disallowed for those Node probes. Valid/invalid request validation and invalid-lineage rejection passed. The source game was neither renamed nor made available by a symlink or workspace path.
- The same check runs `node --permission --allow-fs-read=<isolated-copy> --allow-fs-write=<isolated-copy> dist/cli.js invalid-command` and the removed `import` command. Both exit 1 with supported usage and no game import help. Only the inherited private token initialization occurs; no service/setup log, output directory, subprocess or model download occurs. The token is deleted with the disposable copy.
- Python SHA-256 comparison verified all 29 inventory source/destination pairs, including unchanged pins, Python locks and all schema bytes. All 28 package entries and 28 snapshot entries in the reduced pnpm lock match their source entries exactly. Every adaptation is explained in the inventory.
- `git ls-files --cached --others --exclude-standard`, filtered for existing files to account for the deleted baseline `.DS_Store`, produced 55 prospective files with no runtime/private/audio/weight/build content. The local candidate list is `.git/codex-task-runner/task01-candidate-files.txt`. `git check-ignore` confirmed runtime, output, dependencies, build products, Python bytecode, weights and local test artifacts are ignored. `.DS_Store` is removed from the working tree and its ignore rule covers future copies. `git diff --check` passed.

Recovery and mutations: created only selected project files, ignored destination `node_modules/` and `dist/`, and disposable copies `audio-factory-core-i6XmjG` and `audio-factory-core-1jGJUC` under the system temporary directory. Both copies were removed in the check's finally block; destination `.runtime/` and `out/` do not exist. Installation reused the package cache; no inference, model/Python setup, source-game mutation, staging or commit occurred. Repeating the frozen install/build and packaging check is safe.

Initial check corrections: the first CLI probe denied token creation because its write allowance named the not-yet-existing `.runtime` directory; allowing writes within the existing disposable root fixed the harness and the full check passed. An ad hoc lock comparison initially asserted an incorrect expected count of 27; comparing every actual entry confirmed all 28 entries match. Neither finding required a runtime change.

Inherited: unchanged backend/model/audio/QA settings are bound to inventory hashes; source listening and inference evidence is not claimed as a standalone run. Unrun: browser/game checks and real inference/setup smoke are not required by task 01 and were not performed. Launcher verification belongs to task 02; regression suites and real setup/jobs belong to later tasks. No mandatory task-01 check is missing. Owner acceptance is not required.
