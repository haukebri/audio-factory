# 02 — Wire the root launcher and setup paths

Status: [ ] Not started

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

Not run. Record commands and outcomes, input revision/hashes, relevant artifact locations, external mutations and recovery state here during implementation. Distinguish mandatory, inherited and best-effort evidence. Leave Status unchecked if a mandatory check is missing or failed.
