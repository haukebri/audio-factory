# 05 — Add validated request and cut examples

Status: [ ] Not started

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [02](../../milestone/02-portable-workflow.md)
Depends on: [04 — Verify offline QA and portable exports](04-portable-export-checks.md).
Expected duration: 10–20 minutes.

## Outcome

Provide small usable JSON examples that exercise the existing interface without adding features.

## Work and scope

Add `examples/request.json` (five-second wood knock with a fixed seed), `examples/qa-signal.json`, `examples/qa-clap.json` (short target and relevant alternatives), and `examples/cut.json` (both start/end bounds and an allowed peak target). Explain in `examples/readme.md` that explicit bounds must fit the actual generated source, and show default-cut/normalization-off variants without unnecessary extra files.

Document the exact root-local commands, temporary output lifetime and retain-before-retry ordering. Distinguish a request example from an assertion that the model will produce one event.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- Parse every example and validate it using the actual copied request/QA validators; validate cut options through the runtime's cut-request validator or a fixture run, not an invented schema.
- Confirm CLI arguments match the examples and all local documentation links resolve.
- A fixture invocation accepts the cut options on suitable source audio. Do not run real generation or claim listening quality for this documentation task.

## Preflight and recovery

Use existing validators and fixtures. If fixed cut bounds do not fit a real clip, explain adjustment rather than weakening validation. No additional packages or model downloads are required.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Not run. Record commands and outcomes, input revision/hashes, relevant artifact locations, external mutations and recovery state here during implementation. Distinguish mandatory, inherited and best-effort evidence. Leave Status unchecked if a mandatory check is missing or failed.
