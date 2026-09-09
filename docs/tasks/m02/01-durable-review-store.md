# 01 — Persist candidates and human feedback

Status: [x] Complete

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

Implemented and verified on 2026-09-09 against input revision `9588700fafa3807a05be1539f8fb9d10e533216b` (clean starting tree). No repository/ancestor AGENTS.md file was present; the owner-provided working agreements applied. Preflight: Node `v22.22.3`, pnpm `9.15.9`, installed build dependencies, signal Python environment, and 681 GiB available. No downloads, credentials, models or external sessions were needed.

Implementation: `review-store.mjs` exposes `openReviewStore(root)` (default `.runtime/studio/`), `saveCandidate(candidate, sourceBytes, deliveredBytes?)`, `loadCandidate(hash)`, `listCandidates()`, `readAsset(hash, "source" | "audio")`, `feedback(event)`, `history(hash)` and `evaluationData()`. Root is trusted application configuration and must be outside `out/`; all external asset access uses validated IDs and fixed asset names, with symlink rejection. Candidate input requires `attempt_id`, explicit `fixture`, `evidence`, and nullable `evaluation`. Evidence is an unchanged verified export or `{ generation, analyses, cut_failure, reason }` for source-only attempts. Automatic evaluation carries the exact audio hash, model/revision, rubric hash, verdict and reasons. Stable serialization hashes the complete provenance, including attempt, seed/settings, source/cut hashes, bounds and QA. No automatic verdict or imported export review becomes a human label.

Human submissions require `event_id`, `candidate_sha256`, `supersedes` (null for the first event), `actor: "human"`, `verdict`, `reason_tags` and `note`; the store supplies the timestamp. Corrections append; identical retries return the original event, including its timestamp, even after subsequent corrections. Conflicting IDs and stale predecessors fail. Exclusive publication of numbered event files also arbitrates independent processes. `evaluationData()` returns only explicitly reviewed non-fixture candidates, with the full history and current human decision. Review schema remains compatible with provisional/accepted exports and additionally accepts rejected/auto_accepted/needs_review states; stored exports are never rewritten.

Recovery: candidate assets and records are synced in a unique `pending/` directory, verified, then published by directory rename. The store returns success only after publication, directory sync and read-back verification. Save errors throw; the shared workflow in task 02 must await success before starting another generation. A crashed partial save remains diagnosable in `pending/` and cannot be listed as complete. Retrying the same intact input publishes the same candidate hash without changing/deleting the source or old pending evidence. Interrupted feedback temporary files are ignored; a retry recovers a published event or safely publishes the missing revision. The store does not launch/replay generation. HTTP endpoints, job orchestration and portable export endpoints remain task 02.

Checks executed:

- `pnpm build` — passed.
- `node --test review-store.test.mjs` — passed; final run used owned root `.runtime/review-store-test-pk7PYA`. The model-free smoke creates a deterministic valid export, approves/rejects/corrects it, retries an old identical event, rejects conflicts/stale submissions, races two independent feedback processes, verifies source-only/no-cut and failed-cut evidence, validates old/new review states, excludes fixture labels and automatic-only decisions, and rejects invalid IDs, paths, notes, tags, hashes and symlink assets.
- The same check deliberately exits a child with code 23 after writing source audio but before delivered audio. Restart sees zero complete candidates, retains the incomplete directory, and successfully reconciles by retry. Original bundle metadata/source/delivered bytes remain unchanged. It copies the store to `relocated/`, deletes only the owned fixture `out/`, then starts a new Node process: all four candidates, three correction events and source-only rejection still verify/load. A corrupt asset fails verification.
- `pnpm test:audio-factory` — passed: nine Node checks (including the new store smoke and existing service, isolated build, offline retention and QA recovery checks), then two Python signal checks. This run used `.runtime/review-store-test-2Uecax`; existing QA/core/service tests reported cleanup of their owned roots.
- `git diff --check` — passed. No commits or runner changes.

All new test roots (including initial `.runtime/review-store-test-uHW5M0`) were removed after success; all spawned store processes exited and were awaited. No model process was launched. No browser check, live generation smoke or human listening was run: this task explicitly requires deterministic persistence fixtures only, and adds no browser surface. All labels, including the non-fixture eligibility branch exercised in the isolated smoke, are synthetic test inputs and were deleted; no quality improvement or real acceptance is claimed. No mandatory check remains unrun, and no owner acceptance gate applies.

Reproducible fixture SHA-256:

| Input/artifact | SHA-256 |
| --- | --- |
| Source WAV | `f5af57e6de9a850a1a8e46feace23bed6dcb67e4255931e9124298a1a220a719` |
| Delivered WAV | `7c9a62d127d08b21ac595be0b461a70a2e76cdbd1bed61ba098f455b95fe401d` |
| Original bundle JSON | `f521b24d91029ab42e387db551df8afd4ac6ca81b935e52eb112a4c7900dda8b` |
| Candidate identity | `1b2349eb21bb9db7e5267312be1e1987d5b65e6c02395089363841acc678b914` |
| `review-store.mjs` | `2f960dd844c8bf5087cf594a761e24f7898dee0ad17217a9a5b468a6950434f9` |
| `review-store.test.mjs` | `06f58c5c277e7e1e9bc0299fc0a9eb7bbe1e862e5c6b74698589ab0f774b1f71` |
| `review.schema.json` | `ddd8d9ed319f5db1a98ba45cc89cea73a4557f0259a3b183eee607b60fa16915` |
| Unchanged `export-lineage.mjs` | `49e92152df8c40206119f1585e56af8b35baa5da5b5975d3fbeb909957915dcf` |
