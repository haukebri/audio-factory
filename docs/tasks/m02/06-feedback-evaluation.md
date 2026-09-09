# 06 — Use human feedback for repeatable quality evaluation

Status: [ ] Planned

Overview: [M2 queue](00-overview.md) · [Project](../../project-overview.md)
Milestone: [M2 — Review studio and automatic quality control](../../milestone/05-review-and-quality.md)
Depends on: [05 — Reject and regenerate within a durable budget](05-automatic-quality-loop.md).
Expected duration: 45–90 minutes.

## Outcome and scope

Export real human feedback and immutable audio/provenance into a versioned local evaluation dataset. Exclude synthetic fixtures, automatic labels and superseded human decisions from ground truth while retaining audit history. Group related prompts/source lineages and duplicate audio into one partition. Establish development/holdout separation before tuning; add a UI view of label counts, coverage, disagreements and unreviewed examples with optional blind review.

Implement repeatable comparison of the recorded M1 signal/CLAP baseline (`laion/clap-htsat-unfused`), the Larger CLAP General score/signal policy and bounded selection policy. Report confusion counts, precision, false accepts/rejects, uncertainty coverage, human approval of selected outcomes, attempts and latency with denominators and uncertainty. Freeze thresholds/rubrics/policies and benchmark manifests; support selecting a tested policy and rollback without rewriting old verdicts. Begin with evaluation-driven description/threshold/region-policy adjustments, not online model training.

Use the milestone's initial targets and minimum human sample. If real labels are insufficient, run the metric machinery on explicitly synthetic fixtures and report quality_not_established with the exact missing counts. Deliver the working evaluation/collection workflow; do not invent human listening or hold the entire engineering queue waiting for labels. Leave milestone quality checkboxes unchecked.

## Required checks and review demo

- A small known synthetic dataset independently verifies confusion counts, abstention handling, deduplication, correction semantics and grouped split isolation.
- Export/import preserves candidate hashes and human label provenance; no auto verdict becomes ground truth.
- Run on available real feedback, report exact counts and either actual measured results or insufficient-data status.
- Demonstrate development-only policy changes, repeatable holdout evaluation and rollback with historical results unchanged.

## Preflight and recovery

No new generations are needed to build evaluation. Reuse collected clips and cached judge outputs when audio/model/rubric hashes match. Full reevaluation needs an explicit recorded workload budget. Never upload the dataset or train on held-out labels. Missing real labels limits the quality conclusion, not the deliverability of this tooling.

Follow the shared execution, evidence and completion agreement in [00-overview.md](00-overview.md). Implement only this task and its integration needs, update this status/overview plus directly supported milestone items, and leave later tasks to the queue. The runner owns review and commits; do not change the runner or commit from the implementation session.

## Evidence

Not executed. Record exact commands, outcomes, input revision/hashes, artifact paths and mutations/recovery here during implementation.
