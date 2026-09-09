# 02 — Expose the local studio and shared job workflow

Status: [ ] Planned

Overview: [M2 queue](00-overview.md) · [Project](../../project-overview.md)
Milestone: [M2 — Review studio and automatic quality control](../../milestone/05-review-and-quality.md)
Depends on: [01 — Persist candidates and human feedback](01-durable-review-store.md).
Expected duration: 45–90 minutes.

## Outcome and scope

Add a loopback studio command/server that stays available for history and playback while compute subprocesses are temporary. Reuse the generation/setup/QA/cut/bundle implementation in a shared workflow called by studio and agent/CLI entry points; do not duplicate the pipeline or remove existing commands. Implement bounded, persisted job submission/status/cancel and candidate/review/export endpoints. A submitted request returns an identity promptly, with progress readable after refresh.

Implement browser session bootstrap, exact same-origin/Host validation and mutation protection. Keep the existing bearer token server-side and preserve legacy non-browser authentication/Origin rejection. Serve only registered candidate assets, support native audio playback and safely render no HTML from prompts. One owned compute job at a time; repeated submission attaches to the same job. Persist generated candidates before startup can clear temporary output. Graceful shutdown drains/stops owned work, not unrelated processes.

## Required checks and review demo

- With a controlled backend, submit, reconnect, cancel and restart a job; no duplicate generation or lost candidate/feedback.
- Access candidate audio and export through registered IDs; reject traversal, unknown IDs, foreign Origin/Host and missing mutation credentials.
- Confirm the legacy authenticated API remains usable and browser protection was not replaced with wildcard CORS.
- Verify the studio remains available after compute exits and that closing it cleans up owned work.

## Preflight and recovery

Preflight a free loopback port and existing process ownership. Use controlled generation and isolated persistence roots for checks; never invoke real `make` against wanted output. Use bounded graceful stop followed by owned-process termination only if needed. Record interrupted state before any retry; require explicit resume when a generation outcome is unknown.

Follow the shared execution, evidence and completion agreement in [00-overview.md](00-overview.md). Implement only this task and its integration needs, update this status/overview plus directly supported milestone items, and leave later tasks to the queue. The runner owns review and commits; do not change the runner or commit from the implementation session.

## Evidence

Not executed. Record exact commands, outcomes, input revision/hashes, artifact paths and mutations/recovery here during implementation.
