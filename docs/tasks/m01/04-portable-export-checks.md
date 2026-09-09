# 04 — Verify offline QA and portable exports

Status: [ ] Not started

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [02](../../milestone/02-portable-workflow.md)
Depends on: [03 — Port service and recovery checks](03-service-regressions.md).
Expected duration: 25–45 minutes.

## Outcome

Demonstrate that a prepared cut and its companions can be retained and moved into another project without game code.

## Work and scope

Port the applicable `qa.test.mjs` and `qa_test.py` checks. Remove game importer, attack-feedback provenance and loop-builder dependencies from the standalone test port; retain their relevant core lineage assertions through `verifyExport`. Extend `test:audio-factory` to run service, QA and signal checks using the pinned minimal signal environment.

Trace offline analyze/cut → bundle generation → `retain` → copied bundle validation. Preserve region-1 default, explicit bounds, fades, normalization target/off, immutable source, QA references and provisional review. Preserve explicit missing-CLAP results alongside signal evidence. Add a focused relocation/retention check if the source has no standalone equivalent; fix only extraction failures.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- The focused suite and Python signal assertions pass without model downloads or game imports. Exact silence, opposite-phase stereo, region boundaries, pulsing bass and steady bass remain covered.
- Check default region selection, measured -3/-9 dBFS targets, normalization off, invalid/partial bounds, no-region failure, repeat retrieval and unchanged source bytes.
- Retain a fixture export, copy the complete bundle to another directory, remove only the fixture's original temporary run, and validate the copied prepared WAV, original WAV and metadata. Missing/tampered companions must fail verification.
- Verify signal-only operation and missing CLAP reporting, and offline operations' stopped-session requirement without a persistent service.

## Preflight and recovery

Preflight FFmpeg and the pinned signal environment. Use fixture-owned paths and keep raw evidence until the destination verifies. Do not implement a universal importer, automatically regenerate on QA findings, or alter QA thresholds. Reuse task 03 service results while service code is unchanged.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Not run. Record commands and outcomes, input revision/hashes, relevant artifact locations, external mutations and recovery state here during implementation. Distinguish mandatory, inherited and best-effort evidence. Leave Status unchecked if a mandatory check is missing or failed.
