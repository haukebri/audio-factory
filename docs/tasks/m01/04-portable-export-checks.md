# 04 — Verify offline QA and portable exports

Status: [x] Complete

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [02](../../milestone/02-portable-workflow.md)
Depends on: [03 — Port service and recovery checks](03-service-regressions.md).
Expected duration: 25–45 minutes.

## Outcome

Demonstrate that a prepared cut and its companions can be retained and moved into another project without game code.

## Work and scope

Port the applicable `qa.test.mjs` and `qa_test.py` checks. Remove game importer, attack-feedback provenance and loop-builder dependencies from the standalone test port; retain their relevant core lineage assertions through `verifyExport`. Extend `test:audio-factory` to run service, QA and signal checks using the pinned minimal signal environment.

Trace offline analyze/cut → bundle generation → `retain` → copied bundle validation. Preserve region-1 default, explicit bounds, fades, normalization target/off, immutable source, QA references and provisional review. Preserve explicit missing-CLAP results alongside signal evidence. Add a focused relocation/retention check if the source has no standalone equivalent; fix only extraction failures.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- The focused suite and Python signal assertions pass without model downloads or game imports. Exact silence, opposite-phase stereo, region boundaries, pulsing bass and steady bass remain covered.
- Check default region selection, measured -3/-9 dBFS targets, normalization off, invalid/partial bounds, no-region failure, repeat retrieval and unchanged source bytes.
- Retain a fixture export, copy the complete bundle to another directory, remove only the fixture's original temporary run, and validate the copied prepared WAV, original WAV and metadata. Missing/tampered companions must fail verification.
- Verify signal-only operation and missing CLAP reporting, and offline operations' stopped-session requirement without a persistent service.

## Preflight and recovery

Preflight FFmpeg and the pinned signal environment. Use fixture-owned paths and keep raw evidence until the destination verifies. Do not implement a universal importer, automatically regenerate on QA findings, or alter QA thresholds. Reuse task 03 service results while service code is unchanged.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Completed 2026-09-09 against clean standalone input HEAD `e99afd9417f38520251861eacd554d8da58f0037`. Source HEAD remains `00d64d6cbf71bf0f9d35832784d7a9aa3ffe35aa`. No on-disk repository/ancestor AGENTS.md exists; supplied working agreements apply. Read the full task, queue, specification, milestone, source README/QA/workflow, source tests and service → QA → Python/FFmpeg → bundle/verification plus CLI → setup/retention paths.

Implementation: ported `qa.test.mjs`, replacing game importer/provenance/loop assertions with `verifyExport`; copied `qa_test.py` byte-for-byte. Added one isolated offline CLI retention/relocation test and focused missing bounds/fade/lineage assertions. Extended `test:audio-factory` to run service, packaging, QA and Python signal checks. README records the minimal pinned fixture setup and distinguishes it from full generation setup. No runtime code, thresholds, model pins, runner or later tasks changed.

Input SHA-256: source `qa.test.mjs` `597b1ab5e07c4a2e18448998770c9a69d2c1c5c66dfc88b2d63a4ffc1e52e59a`; source/destination `qa_test.py` `c0e37c24a63f098f49b2ef59dbcdd9f8a6bcbcb181c22538027c7a238ac14b01`; final standalone `qa.test.mjs` `2e7d80c0414133eae3bc36d48781aa9fcd32ffdd379638e06fa013c6a1c061d4`. `requirements.lock` `e38396e526d5e27cc5d4bd36d5802f876d82042b5a1a6ad3c77e74d24395cb3a`; unchanged QA settings `2fb909fa8929b9ad23c1a6937439e388bbceb17461357fd64c271b94b91e7545`.

Mandatory evidence:

- Preflight `ffmpeg -version`: FFmpeg 9.0.1. `uv venv --python 3.11.15 .runtime/mlx-venv` followed by `uv pip sync --python .runtime/mlx-venv/bin/python <(rg '^(numpy|soundfile|cffi|pycparser|typing-extensions)==' requirements.lock)` succeeded. Installed only numpy 2.4.6, soundfile 0.14.0, cffi 2.1.1, pycparser 3.0 and typing-extensions 4.16.0; an `importlib.metadata.version` assertion compared all five installed versions against `requirements.lock` and passed. No generation/CLAP model download.
- `pnpm build` passed, log `.test-artifacts/m01-04-build.log`. Final `pnpm test:audio-factory` passed seven Node tests (zero skipped) in 6.9 seconds and both Python signal tests, log `.test-artifacts/m01-04-tests.log`. The original Python assertions cover exact silence, opposite-phase stereo, silence/active boundaries, pulsing bass, steady bass and unavailable CLAP preserving signal evidence.
- API assertions establish two detected regions, region-1 default, measured -3/-9 dBFS peaks within 0.0001 linear amplitude, normalization off with zero gain and unchanged peak, partial/negative/reversed/empty/out-of-range bounds rejected, explicit sample boundaries/duration, both fade ends measured in PCM, identical cut POST and authenticated GET retrieval, and unchanged source bytes. The isolated offline silence fixture fails explicitly with “No active region detected” and preserves its bytes.
- Isolated CLI demo: deterministic service generation → reject analyze/cut/retain while the fixture session is running → close service → inspect/analyze/cut/repeat cut → retain → copy all three companions to `other-project` → verify → remove only the fixture original run → verify again. Source WAV and run JSON remain unchanged until that deliberate deletion. Verified prepared PCM16 stereo 44.1 kHz audio, original hash, generation settings, cut region, both QA references and provisional review. Missing/tampered prepared WAV, original WAV and JSON each fail; mismatched source lineage and QA/review references also fail. Restoring the companions restores successful verification.
- Signal-only CLI analysis reports disabled CLAP. A direct offline `qaOperation` in the isolated copy with no CLAP interpreter reports explicit ENOENT failure alongside two signal regions; the subsequent bundle preserves that failed-CLAP evidence and advisory status. This deliberately bypasses automatic CLAP setup to test the missing-component result without downloading a model. The fixture supplies placeholder files solely for the setup existence preflight; setup scripts throw if unexpectedly invoked. No inference uses these files. CLI `status` reports stopped before and after offline work; the fixture server is closed.
- Final relocation path (removed after verification): `.runtime/offline-test-OT7TzM/other-project/0b80fd36f7c24c2a809c99ddce469cd7.wav`. Original SHA-256 `394ad80a8e61c338977acf4cd6d5cb0c3790592a6bdc3c578f6218b6683eb063`; prepared SHA-256 `56748d88353a7da699de793ad4ee18cf4412fcab53996cd3f6bf34dd377712a4`. Complete temporary paths and pass results are in the ignored test log; raw bundle evidence was kept until destination verification succeeded.
- Cleanup: independently parsed fixture paths from the final log and asserted every path absent; asserted no repository `out/`, and `.runtime/` contains only `mlx-venv`. Process inspection found no fixture CLI/Python/FFmpeg children. `git diff --check` passed.

Inherited: task 03 service/recovery results remain applicable because service/runtime code is unchanged; `service.test.mjs` still hashes to `d821f7edf3523a87aa01bb1b25811f99f38183987ddfa7c97b9fd386269d5b52`. Its normal suite also passed in this task. The prior controlled failure-cleanup probe was not repeated. Source listening rationale and model pins are inherited, not new listening acceptance.

Mutations/recovery: created the ignored reusable signal environment, compiled output and ignored evidence logs. Tests created and removed only owned fixture directories, tokens, placeholder model-presence files, retained bundles and destination copies. No source-project mutation, real cache/output deletion, model download, staging or commit. Reruns allocate fresh fixture roots; no unfinished recovery remains. Reuse the signal environment; do not sync the minimal subset over a future full generation environment.

Unrun: no browser check or real-model smoke is required here, and neither ran. Fresh full installation and real jobs remain tasks 07–08. Listening is best-effort and was not performed; fixture exports remain provisional. No mandatory check is missing. Owner acceptance is not required.
