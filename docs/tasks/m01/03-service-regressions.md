# 03 — Port service and recovery checks

Status: [ ] Not started

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [03](../../milestone/03-standalone-verification.md)
Depends on: [02 — Wire the root launcher and setup paths](02-launcher-and-setup.md).
Expected duration: 20–40 minutes.

## Outcome

Protect the extracted service contract with the source's controlled-backend checks before using real models.

## Work and scope

Port `service.test.mjs` and `wav-fixture.mjs` with only standalone path/fixture adaptations. Add a working `test:audio-factory` package command for the checks currently present. Include necessary fixture prerequisites without generation or CLAP model downloads.

Preserve source coverage of bearer authentication, Origin rejection, strict request/body limits, busy responses, idempotent replay/conflict, accepted work after disconnect, backend failure, interrupted work, draining/idle shutdown, port ownership and owned-process recovery. Reuse existing tests; add only the smallest behavioral check for an extraction gap that is not already covered. Fix extraction regressions at their shared cause.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- `pnpm build` and `pnpm test:audio-factory` pass with deterministic PCM/fake generation and no model download or Urban Wildlife module dependency.
- Map the listed contract behaviors to actual assertions in the task evidence; do not claim a behavior from a test name alone. Missing required behavior needs a focused assertion.
- Show that failed initialization/port contention does not clear a prior output session or signal unrelated processes; successfully initialized sessions clear only temporary output while preserving cache/retained sentinels.
- Verify fixture services and child processes drain or terminate after both passing and failing cases.

## Preflight and recovery

Use temporary directories and dynamically available fixture ports where supported. Install only necessary signal-test packages from existing pins if required. Never point destructive lifecycle fixtures at real output or caches. This task ports scoped behavioral protection, not a test-suite cleanup review.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Not run. Record commands and outcomes, input revision/hashes, relevant artifact locations, external mutations and recovery state here during implementation. Distinguish mandatory, inherited and best-effort evidence. Leave Status unchecked if a mandatory check is missing or failed.
