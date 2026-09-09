# 03 — Build the prompt and listening workspace

Status: [ ] Planned

Overview: [M2 queue](00-overview.md) · [Project](../../project-overview.md)
Milestone: [M2 — Review studio and automatic quality control](../../milestone/05-review-and-quality.md)
Depends on: [02 — Expose the local studio and shared job workflow](02-studio-service.md).
Expected duration: 60–120 minutes.

## Outcome and scope

Use the frontend-design skill to implement the milestone's local Review studio against task 02's real endpoints. Start with plain HTML/CSS/JavaScript, native audio and accessible forms; add dependencies only for an evidenced requirement. Include prompt/constraints and budget inputs, readiness/progress/cancel, persistent request/candidate history, original/prepared playback, comparison, cut adjustment, approve/reject with reason tags/note, blind-review mode, retry and verified export.

Show human and automatic verdicts separately. Until a judge is connected, state that automatic evaluation is unavailable; do not fabricate scores. Show setup/missing-model/error/interrupted/exhausted/empty states with a concrete next action. Feedback success appears only after persistence. Preserve prompt edits across refresh. Users can finish the normal flow without opening JSON files. All controls are keyboard usable, labelled and visibly focused; status is not conveyed by color alone.

## Required checks and review demo

- Run a real browser journey against controlled fixture generation: enter a prompt, play candidates, adjust a cut, reject with a reason, approve another and export its complete bundle.
- Refresh and restart the studio; confirm history/feedback and pending-job attachment remain correct.
- Exercise keyboard navigation, narrow viewport, missing judge, rejected operation and cancelled job states; inspect screenshots and fix layout issues.
- Test malicious-looking prompt/model text as inert text. Verify downloaded export hashes and browser playback resource responses. Browser playback is UI evidence, not an agent listening claim.

## Preflight and recovery

Preflight browser automation and local session access before implementation. The browser can use synthetic candidates for its technical journey. Reuse available tooling; no hosted deployment, public visibility change or cloud service. Actual owner listening can now collect real labels independently while later tasks run; do not block engineering tasks waiting for a label quota.

Follow the shared execution, evidence and completion agreement in [00-overview.md](00-overview.md). Implement only this task and its integration needs, update this status/overview plus directly supported milestone items, and leave later tasks to the queue. The runner owns review and commits; do not change the runner or commit from the implementation session.

## Evidence

Not executed. Record exact commands, outcomes, input revision/hashes, artifact paths and mutations/recovery here during implementation.
