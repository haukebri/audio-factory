# 11 — Verify the prospective source distribution

Status: [ ] Not started

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [04](../../milestone/04-distribution-readiness.md)
Depends on: [10 — Prepare the source and third-party notice inventory](10-third-party-notices.md).
Expected duration: 15–30 minutes.

## Outcome

Prepare and inspect the actual source file set before the final license decision, without publishing it.

## Work and scope

Create a prospective release inventory in this task's evidence using an explicit file list or existing Git facilities. Inspect all proposed files, including hidden directories, to include implementation, config/schemas, locks, examples, skill, notices and docs and exclude private runtime state, weights, generated audio, caches, build products and game content. Mark LICENSE as pending if no authorized license exists yet.

Use a disposable distribution copy to run frozen package installation/build and the focused fixture suite. Check README/skill/example paths in that copy. Reuse task 07–08 real setup/smoke evidence if all relevant files and pins match; compare hashes to prove reuse is valid. Record any required rerun if inputs differ. Avoid adding a packaging framework.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- The recorded candidate inventory contains every file needed for the documented workflow, with no external workspace symlink/dependency and no secret or operational artifact.
- Frozen install, build and focused tests pass in the distribution copy. Required notices and documentation are present; only the explicitly recorded license decision may remain for task 12.
- An input comparison binds real setup/smoke evidence to this candidate, or the affected verification is rerun successfully.
- No package upload, push, repository visibility change or public release occurs. Milestone 4 remains incomplete until licensing and final closure in task 12.

## Preflight and recovery

Use an isolated copy; do not delete private state to make the source tree appear clean. Inspect generated inventory content before committing it so it contains no tokens or private log contents. Reuse valid evidence and clean only task-owned throwaway files. A missing license choice does not prevent this preparatory audit.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Not run. Record commands and outcomes, input revision/hashes, relevant artifact locations, external mutations and recovery state here during implementation. Distinguish mandatory, inherited and best-effort evidence. Leave Status unchecked if a mandatory check is missing or failed.
