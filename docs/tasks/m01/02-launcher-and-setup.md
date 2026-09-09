# 02 — Wire the root launcher and setup paths

Status: [x] Complete

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [01](../../milestone/01-standalone-core.md)
Depends on: [01 — Extract a buildable standalone core](01-standalone-core.md).
Expected duration: 15–30 minutes.

## Outcome

Make the standalone root launcher reach the existing temporary-job CLI and local setup scripts without monorepo assumptions.

## Work and scope

Adapt the source `run` launcher to the tool root and make it executable. Preserve frozen dependency bootstrap, compile-and-run behavior and argument forwarding. Trace CLI → setup → Python environments/downloads → backend and CLI → QA → bundle/retain; fix only remaining root/path assumptions and obsolete diagnostics.

Keep explicit setup/repair, optional CLAP, normal `make`/`generate`, offline commands and manual start/status/stop. Preserve platform checks, model hashes, revision/dependency verification, subprocess ownership and existing deadlines. Do not add a second setup system or change the pinned backend.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- `sh -n run`, `pnpm build`, `./run status` and invalid-command usage succeed or fail as specified, with no model setup triggered by status/usage.
- In a disposable copy without project dependencies, exercise launcher bootstrap with a harmless status command; confirm frozen installation and root-local compilation.
- Confirm argument forwarding from a working directory outside the checkout, using an absolute launcher path and an invalid/nonexistent request. The expected input error must not start inference or clear existing output.
- Inspect the complete setup call chain for root-local paths and preserved validation. Real downloads are explicitly deferred to task 07, not claimed here.

## Preflight and recovery

Preflight Node/pnpm and Git/uv/FFmpeg command availability; report missing prerequisites clearly. Do not run setup on an active service. Reuse the installed package cache. Record any created disposable checkout and remove only its owned temporary files after verification.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Completed 2026-09-09 against standalone input HEAD `238d918fe4dc5874f9685f1ccbcda3e55f7dde03` (clean starting worktree). No on-disk destination/ancestor AGENTS.md was present; supplied working agreements apply. Source HEAD remains `00d64d6cbf71bf0f9d35832784d7a9aa3ffe35aa`.

Implementation: copied the source executable `run`, changing only its `cd` from `../..` to the launcher directory. Frozen dependency bootstrap, compile-and-run package script and quoted argument forwarding are preserved. Updated the obsolete setup progress path to `.runtime/setup.log`. Extended the existing standalone packaging check to exercise the launcher.

Input/output SHA-256: source `run` `8114297d10deab5589dd6a5a2142b9411175b0a99384c8904eb8f4172deee1ea`; standalone `run` `8b738f4f17c3c5b3f3e122a5a98fa79c2e612ede295550568a78b8bef31adbb0`. `src/setup.ts` changed from `befde3b47d1437c65d44228655d6bbb3455c6ee1d4b194cc8c4009c05b4e4e05` to `c4c9078edc98c3fb80fae87ad3b9efea83c821f36011f94d86a82a55b25f0eaa`. Other runtime files and pins remain as recorded in task 01's source inventory.

Mandatory checks:

- Preflight commands were available and ran: Node `v22.22.3`, pnpm `9.15.9`, Git `2.49.0`, uv `0.10.11`, FFmpeg `9.0.1`. `lsof -nP -iTCP:8766 -sTCP:LISTEN` found no listener before or after checks. No setup was run on a service.
- `sh -n run` and `pnpm build` passed. Executable mode was verified. `./run status` exited 0 with `{"status":"stopped"}`; `./run invalid-command` exited 1 with supported usage. Only `.runtime/token` was created; no setup/service logs, Python environments, model files or output directory appeared.
- `node standalone-core.test.mjs` passed, including existing isolated imports/schema/usage checks. In its disposable copy, after removing that copy's dependencies and compiled output, the absolute launcher ran `status` from the system temporary directory. Bootstrap reused all nine packages, downloaded zero, reported lockfile resolution skipped, preserved lockfile bytes, compiled local `dist/cli.js`, and exited 0 with stopped status.
- The same check invoked the absolute launcher from outside the checkout with `make` and an absolute nonexistent request path containing spaces, then `generate` and an absolute invalid request path containing spaces. Both exited 1 with the expected `ENOENT`/`minLength` input error. A pre-existing `out/sentinel` remained byte-identical and the only runtime file remained the token: no setup/inference or session cleanup was triggered. Relative file arguments retain source behavior: they resolve from the tool root after launcher `cd`.
- Complete call-chain inspection: CLI validation precedes `launch`; setup/repair and mutating offline commands retain the stopped-session guard. `ensureSetup` invokes root-local `setup.mjs` and optional `qa-setup.py`; those use module/script-local roots for environments, locks, checkout and manifests. `download_models.py` preserves pinned revision, size/hash and symlink checks. Backend startup retains Git revision/tracked-file, dependency lock, Metal and model-hash verification. QA selects root-local Python environments, preserves CLAP lock/hash checks and offline execution, and invokes local bundle/lineage helpers; retain validates companions before copying under `.runtime/retained`. Ownership handling, setup/startup/generation deadlines, manual commands and backend pins were not changed. A focused search found no old workspace paths in the runtime call chain.
- `git diff --check` passed. Cleanup verified the disposable directory was removed, the destination token created by these probes was removed, and destination `.runtime/` and `out/` are absent.

Recovery/mutations: created disposable `/private/var/folders/0s/9gw5k0fx0fj6r_dnq7wnttj00000gn/T/audio-factory-core-8jxlbf`, reported by the check at creation and removed in its `finally` block. Its dependencies, build, invalid request, sentinel and token were owned temporary files. Destination ignored `dist/` was rebuilt; existing dependency cache was reused. No source-project mutation, model download, Python setup, inference, retained output, staging or commit occurred. Rerunning these checks is safe and requires no recovery action.

Inherited: unchanged validation, inference pins and audio behavior use task 01's recorded hashes and source rationale; inspection does not claim real model verification. Unrun: real downloads/setup are explicitly deferred to task 07; real jobs to task 08. Browser/game checks are not required for this launcher task and were not run. No mandatory check is missing; owner acceptance is not required.
