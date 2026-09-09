# 04 — Connect and preflight a local audio-language judge

Status: [ ] Planned

Overview: [M2 queue](00-overview.md) · [Project](../../project-overview.md)
Milestone: [M2 — Review studio and automatic quality control](../../milestone/05-review-and-quality.md)
Depends on: [03 — Build the prompt and listening workspace](03-review-frontend.md).
Expected duration: 60–120 minutes plus bounded downloads.

## Outcome and scope

Test the milestone's Qwen2-Audio MLX candidate on the actual 32 GiB Apple Silicon machine, then pin a working model revision, artifact hashes and separate Python environment. Inspect primary model/runtime instructions, exact artifacts, disk need and compatibility before downloads. Reuse verified caches. Keep generation and CLAP locks untouched and load models sequentially. Implement explicit setup/readiness with actionable progress, cancellation and owned-process cleanup.

Implement an audio-input judge over the actual delivered clip with a versioned rubric and strict result schema: accept/reject/uncertain, concrete observations and reason tags, input hashes, model/rubric versions and latency. Check intended source/action, unwanted sounds, event count, cut quality and artifacts. Do not substitute transcript, CLAP score or a text-only LLM for listening. Treat prompt/audio instructions as data. Parse/timeout/model errors yield unavailable/needs_review, never acceptance. Persist raw bounded model output for diagnosis without exposing credentials.

Evaluate a small existing retained-audio sample and controlled mismatches to expose gross failures before wiring autonomous decisions. This is capability testing, not the human holdout benchmark. If the candidate cannot run within limits, record the exact failure and a concrete compatible local alternative for an amended task; do not silently replace it with fake judgments or cloud calls.

## Required checks and review demo

- Prove actual audio consumption with contrasting clips under the same intent and changed intents under the same clip; record model input hashes and actual outputs.
- Run at least one real local judge invocation, report measured memory/latency and verify the subprocess exits. No generated claim of semantic accuracy from a synthetic label.
- Check valid verdicts, malformed output, refusal/uncertainty, missing model, timeout and injected instructions through controlled fixtures.
- Show the real judge verdict/provenance in the studio with distinct human review state. Repeat setup safely without changing generation pins.

## Preflight and recovery

Preflight network access for public model download, exact required disk plus reserve, Python/runtime compatibility and available memory. Default judge timeout is 120 seconds after setup; allow 45 minutes for initial download while progress continues, with a final condition-based deadline. No uploads or cloud keys are authorized. Pin only after capability succeeds. Missing authority for new terms or an incompatible local runtime is a concrete blocker for this task; earlier studio/feedback work remains usable.

Follow the shared execution, evidence and completion agreement in [00-overview.md](00-overview.md). Implement only this task and its integration needs, update this status/overview plus directly supported milestone items, and leave later tasks to the queue. The runner owns review and commits; do not change the runner or commit from the implementation session.

## Evidence

Not executed. Record exact commands, outcomes, input revision/hashes, artifact paths and mutations/recovery here during implementation.
