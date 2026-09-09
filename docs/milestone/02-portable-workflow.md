# Milestone 2 — Portable workflow

Status: planned. Depends on [milestone 1](01-standalone-core.md).

## Outcome

A developer or agent can use one temporary job, review or adjust its output, and preserve a complete sound bundle for any project without a game-specific importer.

## Work

1. Preserve `./run make request.json [qa-request.json]`: automatic missing-component setup, generation, advisory QA, normalized region-1 export, structured result (`id`, `audio`, `qa`, `report`), and shutdown on success or failure.
2. Preserve offline inspect/analyze/cut and explicit `retain`. Reuse the existing verified bundle and retention implementation. The handoff is the retained bundle directory, including the prepared WAV, original WAV and JSON companion; copying only the prepared WAV loses the portable provenance.
3. Add small generation, signal-only QA, CLAP QA and cut-option JSON examples. Clearly explain prompt/seed/duration limits, optional CLAP, default first-region selection, explicit bounds and normalization options.
4. Adapt the source skill into `.agents/skills/audio-factory/SKILL.md` with root-local commands. Replace game import/build instructions with retain-and-copy delivery. Document how an agent in another project locates the tool checkout; do not assume discovery outside this repository happens automatically.
5. Carry over bounded quality search (three generations per sound by default), listening limitations, provisional review status, advisory QA and explicit retention before retrying. Keep source license references separate from quality acceptance.
6. Document manual HTTP access, authentication without exposing the token, session-scoped IDs/idempotency, busy handling, draining stop, idle shutdown and explicit setup repair. Preserve the API rather than adding an SDK.

## Lifecycle and recovery

A new successfully initialized session clears `out/`; review, adjust and retain before another `make` or `start`. Keep offline mutations sequential and the service stopped. Preserve source audio while cutting, verify all companions before delivery, and never delete a candidate because a partial copy appeared successful. Retained output survives subsequent sessions. There is no new automatic archive or game recipe update.

## Acceptance evidence

- [ ] Examples satisfy the copied request/QA/cut schemas.
- [ ] A fixture export carries original audio, hash-bound generation and cut records, QA references and provisional review status.
- [ ] `retain` verifies and copies all required files; the copied bundle validates from another directory without game assets or the original temporary run.
- [ ] Existing behavior checks establish default first-region cuts, normalization target/off, explicit bounds and source preservation.
- [ ] CLI help, README and skill agree on commands, output lifetime and standalone delivery.
- [ ] The skill references files that exist and contains no required Urban Wildlife import, build or catalog step.

Use focused existing fixtures for this milestone; the real end-to-end job and successive-session checks are required in milestone 3. Do not label fixture output or CLAP scores as listening acceptance.

## Runner tasks

Execute in the global order in [the task queue](../tasks/m01/00-overview.md); task status is authoritative for execution.

- [04 — Verify offline QA and portable exports](../tasks/m01/04-portable-export-checks.md)
- [05 — Add validated request and cut examples](../tasks/m01/05-request-examples.md)
- [06 — Document the standalone agent and manual workflows](../tasks/m01/06-agent-workflow.md)
