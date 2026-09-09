# 08 — Verify two real jobs and session cleanup

Status: [ ] Not started

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [03](../../milestone/03-standalone-verification.md)
Depends on: [07 — Verify first-use setup in an isolated checkout](07-fresh-installation.md).
Expected duration: 20–45 minutes after setup.

## Outcome

Show that the extracted tool completes real generation, QA and portable export and releases its processes across successive sessions.

## Work and scope

Adapt the source `smoke.mjs` to root-local paths and add `audio:smoke`. Use task 07's verified checkout/cache while recording any changed input files. Run two complete real MLX/CLAP/default-cut jobs, retaining the first bundle before starting the second. Preserve both smoke candidates explicitly with their reports.

Verify offline inspect/analyze/cut on the current session, signal-only QA, retained bundle relocation and manual start/status/stop plus idle shutdown. Reuse controlled-backend evidence for disconnect, interrupted work and missing CLAP rather than destroying a real installation. Run the existing standalone build and focused suite once on the smoke-tested code. Listen when a listening tool is available; otherwise record provisional quality without a mandatory owner gate.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- `pnpm audio:smoke` completes two jobs with valid result fields and stereo 44.1 kHz PCM16 raw audio at requested duration, non-silence and verified normalized cuts/lineage.
- The second startup removes the first temporary run; retained bundles, model caches and environments survive. Bundle validation succeeds outside the original output directory.
- Status and owned-process inspection show stopped after each normal job; offline operations leave no server running. Manual sessions drain on stop and exit after configured idle time.
- Signal-only operation works; task 04's missing-CLAP result remains applicable or is rerun if affected. Mandatory build/fixture checks pass on the current code.
- Record run IDs, prompts/seeds, hashes, input revision, commands, retained evidence paths, timing and the actual listening status. Favorable QA must not become an acceptance claim.

## Preflight and recovery

Preflight the still-valid task 07 environment and port ownership, then reuse its verified weights. Retain before a new session; never regenerate merely because a polling observation timed out. Confirm terminal process state before retrying failed work and retain its evidence. Normal inference has the configured 10-minute deadline. Additional seed/class sweeps and benchmarks are best-effort, not additional mandatory jobs.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Not run. Record commands and outcomes, input revision/hashes, relevant artifact locations, external mutations and recovery state here during implementation. Distinguish mandatory, inherited and best-effort evidence. Leave Status unchecked if a mandatory check is missing or failed.
