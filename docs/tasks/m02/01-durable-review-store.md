# 01 — Persist candidates and human feedback

Status: [ ] Planned

Overview: [M2 queue](00-overview.md) · [Project](../../project-overview.md)
Milestone: [M2 — Review studio and automatic quality control](../../milestone/05-review-and-quality.md)
Depends on: M1 and the project-review fixes in the current working tree.
Expected duration: 30–60 minutes.

## Outcome and scope

Add the durable store described in the milestone using existing filesystem/atomic-write/hash patterns. Store each candidate's complete verified assets and provenance outside `out/` before reporting it saved. Include rejected candidates and source-only evidence when no valid cut exists. Record human approval/rejection and reason tags as immutable, idempotent feedback events; retain corrections and distinguish human from automatic decisions. Extend export review representation compatibly where needed; existing provisional bundles must still validate. Keep model evaluation alongside, never rewrite an old export or infer human acceptance.

Expose the smallest reusable store operations needed by the UI and agent workflow. Validate external IDs, hashes, note bounds and paths. No arbitrary path reads or general storage abstraction.

## Required checks and review demo

- Create a valid fixture candidate, approve/reject/correct it, repeat an identical feedback event and reject conflicting stale submissions.
- Restart the store and delete only the owned fixture's `out/`; assets, history and human decisions still load and verify.
- Simulate an interrupted save: incomplete assets cannot appear as a complete candidate. Original bundles remain unchanged.
- Validate old exports and new review states, including rejection; exclude fixture labels from evaluation data.

## Preflight and recovery

Needs Node, the existing build and deterministic audio fixtures only. No models, live audio or network. Use fresh owned directories. A failed persistence step prevents the next generation; never delete the source to recover. Partial writes remain diagnosable and can be safely reconciled.

Follow the shared execution, evidence and completion agreement in [00-overview.md](00-overview.md). Implement only this task and its integration needs, update this status/overview plus directly supported milestone items, and leave later tasks to the queue. The runner owns review and commits; do not change the runner or commit from the implementation session.

## Evidence

Not executed. Record exact commands, outcomes, input revision/hashes, artifact paths and mutations/recovery here during implementation.
