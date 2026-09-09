# 03 — Port service and recovery checks

Status: [x] Complete

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [03](../../milestone/03-standalone-verification.md)
Depends on: [02 — Wire the root launcher and setup paths](02-launcher-and-setup.md).
Expected duration: 20–40 minutes.

## Outcome

Protect the extracted service contract with the source's controlled-backend checks before using real models.

## Work and scope

Port `service.test.mjs` and `wav-fixture.mjs` with only standalone path/fixture adaptations. Add a working `test:audio-factory` package command for the checks currently present. Include necessary fixture prerequisites without generation or CLAP model downloads.

Preserve source coverage of bearer authentication, Origin rejection, strict request/body limits, busy responses, idempotent replay/conflict, accepted work after disconnect, backend failure, interrupted work, draining/idle shutdown, port ownership and owned-process recovery. Reuse existing tests; add only the smallest behavioral check for an extraction gap that is not already covered. Fix extraction regressions at their shared cause.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- `pnpm build` and `pnpm test:audio-factory` pass with deterministic PCM/fake generation and no model download or Urban Wildlife module dependency.
- Map the listed contract behaviors to actual assertions in the task evidence; do not claim a behavior from a test name alone. Missing required behavior needs a focused assertion.
- Show that failed initialization/port contention does not clear a prior output session or signal unrelated processes; successfully initialized sessions clear only temporary output while preserving cache/retained sentinels.
- Verify fixture services and child processes drain or terminate after both passing and failing cases.

## Preflight and recovery

Use temporary directories and dynamically available fixture ports where supported. Install only necessary signal-test packages from existing pins if required. Never point destructive lifecycle fixtures at real output or caches. This task ports scoped behavioral protection, not a test-suite cleanup review.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Completed 2026-09-09 against clean standalone input HEAD `21a4e646c10a25e93728916198bfa4fd5fb6f150`. Source HEAD remains `00d64d6cbf71bf0f9d35832784d7a9aa3ffe35aa`. No destination/ancestor on-disk AGENTS.md exists; supplied working agreements apply. Read the task, queue, project specification, milestone, source README/QA/workflow and complete service → validation/WAV/QA and CLI → setup/backend/ownership paths.

Implementation: ported the three source service tests and byte-identical PCM fixture, using standalone temporary-directory names. Added focused missing contract assertions and one disposable CLI startup test. Failure cleanup releases controlled work, observes pending response rejection, awaits child termination and closes the idle service. No production code change was needed. `test:audio-factory` runs the service tests plus the existing standalone packaging/launcher check. No new dependency or signal environment is needed for these checks; QA/signal fixtures belong to task 04.

SHA-256 inputs: source `service.test.mjs` `73379ba004319f3d7d3c0372473ed4e1544e10c130f925faa900ddc84a65c784`; source and destination `wav-fixture.mjs` `34292b7c079f0ca94f74a2d49726f5e673a4605b8116f15a43d98335aee808be`. Final standalone `service.test.mjs`: `d821f7edf3523a87aa01bb1b25811f99f38183987ddfa7c97b9fd386269d5b52`.

Mandatory checks:

- `pnpm build` passed; `pnpm test:audio-factory` passed all five reported tests (four service tests plus the existing standalone check), zero skipped, in 5.8 seconds. Node `v22.22.3`, pnpm `9.15.9`. Logs: `.test-artifacts/m01-03-build.log` and `.test-artifacts/m01-03-tests.log` (ignored).
- Deterministic in-memory PCM/fake generation uses only Node and installed standalone dependencies. The CLI fixture copies compiled code/config/schemas into a temporary root and links only this repository's node_modules. Its replacement setup script throws a controlled error through the real setup subprocess path; it never invokes model setup/downloads. The existing packaging test separately builds/imports an isolated copy with local dependencies, including permission-restricted imports. Frozen installs reused nine packages, downloaded zero.
- Failure cleanup probe: generated an ignored temporary copy of `service.test.mjs`, rewrote its relative imports one directory up and inserted `assert.fail("controlled assertion failure during accepted work")` immediately after `await wait(() => count === 1)`. `node --test --test-name-pattern="WAV generation" .test-artifacts/service-failure.test.mjs` exited 1 with that intended assertion, no unhandled rejection, closed listening socket and removed its temporary root within the 20-second harness deadline. Probe file removed; log `.test-artifacts/m01-03-failure-cleanup.log` retained. Initial probe exposed an unobserved fetch rejection during teardown; final probe verifies the fix. Initial full run also caught fixture port zero violating the existing minimum 1024 schema; the fixture now reserves/releases a dynamic valid port without altering production validation.
- Cleanup: service assertions verify not busy/not listening after drain, actual idle closure, matching owned-child disappearance and mismatched-owner survival. CLI failure asserts both CLI and setup PIDs have disappeared; its unrelated listening child stays alive/responding until explicitly terminated in finally. Every logged temporary root was independently checked absent after passing/failing runs. Repository `.runtime/` and `out/` remain absent. Process inspection found no task-owned fixture/service/setup children; existing source-project audio-review HTTP servers were left untouched. `git diff --check` passed.

Assertion map (standalone `service.test.mjs`; these are executed assertions, not inferred from titles):

| Required behavior | Assertion evidence |
| --- | --- |
| Bearer authentication / Origin rejection | Lines 44–46: missing/wrong bearer → 401, authenticated Origin → 403; line 64 valid authenticated health → 200. |
| Strict request/body limits | Lines 47–58: missing/blank/overlong prompt, out-of-range duration/seed, fractional seed and unknown output property → 400; wrong media type → 415; malformed JSON → 400; over-16-KiB body → 413. |
| Busy / conflict / replay | Lines 61–72: second key while controlled work is held → 429; changed request under first key → 409; replay → 200 with generation count still one; returned PCM equals fixture bytes. |
| Backend failure | Lines 80–86: controlled backend throw → 502; failed-key replay → 409. |
| Accepted work after disconnect | Lines 88–96: abort after backend entry, release work, wait until idle; replay → 200 and count remains three. |
| Draining shutdown | Lines 97–110: close while fourth job is held; new work → 503 and close still pending; release then close resolves, busy/listening false and persisted fourth run completed. |
| Interrupted work | Lines 111–118: restart a saved generating record; status becomes interrupted with new-key guidance, original PCM bytes preserved. |
| Owned-process recovery | Lines 135–147: wrong identity returns false and child remains alive; matching identity returns true and PID identity disappears; finally awaits termination. |
| Session ownership / successful cleanup / idle shutdown | Lines 179–190: beginSession without listening rejects and old output survives; after binding it removes old output, preserves cache/retained bytes; idle callback actually closes socket. |
| Port contention / failed initialization | Lines 239–262: real CLI serve fails with EADDRINUSE before setup; old output survives and unrelated process identity/HTTP response remain intact. Controlled setup failure after acquiring a separate available port exits with Setup failed, leaves output/cache/retained sentinels unchanged, and leaves neither CLI nor setup child running. |

Mutations/recovery: only repository tests/package/docs and ignored build/evidence logs changed. Temporary fixture roots, tokens, sentinels, setup script/log/PID, dependencies and compiled copies were created and deleted by their owning checks; paths are recorded in logs. No source project mutation, generation/CLAP model download, Python environment install, real output/cache deletion, staging or commit occurred. Reruns create fresh temporary roots and require no recovery action.

Inherited: runtime implementation/pins remain unchanged from tasks 01–02; source hashes identify reused fixture coverage, but the pass above is standalone evidence. Unrun: real setup/download and generation smoke remain tasks 07–08; QA/signal/export checks remain task 04. No browser or real-model smoke is required by this task, and neither ran. No mandatory check is missing. Milestone acceptance boxes remain open because they also require later QA/real-job evidence. Owner acceptance is not required.
