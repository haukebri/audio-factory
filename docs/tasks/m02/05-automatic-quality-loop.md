# 05 — Reject and regenerate within a durable budget

Status: [ ] Planned

Overview: [M2 queue](00-overview.md) · [Project](../../project-overview.md)
Milestone: [M2 — Review studio and automatic quality control](../../milestone/05-review-and-quality.md)
Depends on: [04 — Connect and preflight a local audio-language judge](04-audio-judge.md).
Expected duration: 45–90 minutes.

## Outcome and scope

Extend the shared workflow from task 02 using the real judge from task 04. Apply deterministic validity checks, advisory signal/CLAP information and audio judgment to the delivered candidate. Keep final intent fixed. For an identified trim problem, evaluate a bounded alternative region/cut before generating again; record every derivative and its verdict. On semantic rejection, choose and persist a new seed and launch another generation only within the three-attempt/20-minute budget. Persist all candidate assets first.

Implement explicit auto_accepted, rejected, needs_review, exhausted, cancelled and operational-error outcomes. Uncertainty or a missing judge must not become a pass or a regeneration storm. Human rejection can request another attempt within the selected budget; explicit additional budget creates a recorded continuation. Human decisions override presentation/export selection without erasing judge history. Studio and CLI/agent access share the same policy and durable IDs.

Maintain cancellation across generation and judge boundaries. On restart reuse a completed candidate; never repeat an uncertain external operation automatically. Show the reason for each new attempt, elapsed/remaining budget and current candidate in the UI. Do not conflate accepted-by-model with approved-by-human.

## Required checks and review demo

- Controlled judge/backend sequences cover reject→accept, repeated rejection→exhaustion, uncertain, missing judge, timeout and cancellation.
- Assert exact generation count and distinct recorded seeds; first candidate and feedback survive every attempt.
- Restart between persisted generation, judging and retry transitions without duplicate computation; reconnect UI to the same request.
- Verify alternate-region evaluation judges the final cut and preserves source hashes. Exported outcome retains correct candidate/judge/human identities.

## Preflight and recovery

Use controlled fixtures for exhaustive transition checks. Reuse task 04's real model capability evidence; task 07 owns the new real end-to-end jobs. No unbounded retries or automatic provider/backend swaps. On persistence failure, stop before another generation; on exhausted budget, retain all candidates for review.

Follow the shared execution, evidence and completion agreement in [00-overview.md](00-overview.md). Implement only this task and its integration needs, update this status/overview plus directly supported milestone items, and leave later tasks to the queue. The runner owns review and commits; do not change the runner or commit from the implementation session.

## Evidence

Not executed. Record exact commands, outcomes, input revision/hashes, artifact paths and mutations/recovery here during implementation.
