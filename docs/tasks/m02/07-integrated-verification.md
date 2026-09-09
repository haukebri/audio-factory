# 07 — Verify the studio and quality loop end to end

Status: [ ] Planned

Overview: [M2 queue](00-overview.md) · [Project](../../project-overview.md)
Milestone: [M2 — Review studio and automatic quality control](../../milestone/05-review-and-quality.md)
Depends on: [06 — Use human feedback for repeatable quality evaluation](06-feedback-evaluation.md).
Expected duration: 45–90 minutes plus setup if missing.

## Outcome and scope

Verify the assembled local studio, shared agent workflow, real judge, retained candidates and human feedback persistence on the supported machine. First bind current runtime/pins to prior evidence and run only affected checks. Use a dedicated verification store and preserve wanted output before any real generation.

Run a maximum of three new real generations in one bounded request using the local generator and judge. A real judge is allowed to accept, reject or remain uncertain; never manipulate its verdict to manufacture a rejection demo. Use the already validated controlled reject→accept case to prove retry mechanics if the real sample does not naturally reject. Listen only if an actual audio-input tool or owner is available and record who listened; model verdict is not human approval. Drive the real browser from prompt through playback, feedback persistence and complete bundle export, then restart and verify the same history. Any agent-created fixture feedback stays tagged synthetic.

Update user/agent instructions, prerequisites, source inventory and milestone product acceptance based on exact evidence. State measured quality separately using task 06; missing human benchmark evidence remains quality_not_established. Record defects and fix in-scope integration failures before closing this task; do not claim the full quality outcome on task counts.

## Required checks and review demo

- Build and affected regression checks pass; browser screenshots show usable normal/failure/reconnect states.
- Real generation and audio judge consume matching source/derivative hashes; exported bundles validate after relocation and later sessions.
- Candidate history, feedback and selected policy survive restart. No wanted output is lost; no compute/model subprocess remains.
- CLI/agent and browser results agree on request identity and verdicts. Auth/origin/path and cancellation checks pass.
- Documentation links and whitespace pass; evidence distinguishes real jobs, synthetic review events, model verdicts and actual human labels.

## Preflight and recovery

Preflight Node/pnpm/Python/uv/FFmpeg, Apple Silicon memory/disk, browser control, free owned ports and all pinned model manifests. Reuse caches and task 04's setup. Default maximum three generations, 20-minute request budget after setup; do not repeat successful real jobs just to refresh documentation. Preserve every candidate before the next session and clean only owned fixture/store/process state. No commit by implementation session and no publication.

Follow the shared execution, evidence and completion agreement in [00-overview.md](00-overview.md). Implement only this task and its integration needs, update this status/overview plus directly supported milestone items, and leave later tasks to the queue. The runner owns review and commits; do not change the runner or commit from the implementation session.

## Evidence

Not executed. Record exact commands, outcomes, input revision/hashes, artifact paths and mutations/recovery here during implementation.
