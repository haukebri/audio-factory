# Recover incomplete signal dependency setup

Overview: [Review queue](00-overview.md)

Status: [x]
Priority: P2
Area: code / reliability

## Finding

ensureSetup only queues uv pip sync when the interpreter file is absent. An interrupted sync leaves the interpreter present, and subsequent setup/analyze/cut calls skip dependency repair. With an existing generation manifest/models, even ./run setup skips setup.mjs and can report ready while signal analysis still fails. Direct setup.mjs always syncs, but the advertised launcher does not reach it in this state.

Source: `src/setup.ts:6–16; src/cli.ts:201–207; setup.mjs:65–68` (revision `c5ad0b28871a7a9c0b55433f2b0b334bb7a66bef`).

## Evidence

The unchanged compiled setup implementation was copied into an isolated root with an unusable existing interpreter. ensureSetup(false) returned success without a dependency check or repair. See code-review/reproduce.mjs. Source tracing confirms the same gate is used for cuts, analyses and the setup CLI.

## Requested change

Use a successful dependency-lock readiness marker or a cheap required-import check, and run the existing pinned sync when incomplete. Publish readiness only after success; make explicit setup repair the supported environment without deleting evidence.

## Acceptance

Interrupt/fail dependency sync after venv creation, then rerun the supported command. The rerun repairs dependencies and a synthetic analysis succeeds. Already-valid environments avoid unnecessary downloads.

No implementation change is included in this review.

## Implementation and verification

Completed 2026-09-10. Shared setup now probes the `numpy` and `soundfile` imports used by signal analysis. An incomplete environment runs the existing pinned sync and must pass the imports before returning ready. Fresh generation setup owns venv creation/sync, avoiding a second queued venv creation afterward. Existing audio and setup logs are preserved.

- `pnpm build` passed.
- `node --test setup.test.mjs` first reproduced false readiness against the original implementation, then passed after the fix. The isolated launcher fixture creates a real Python 3.11.15 venv, injects a sync failure, repairs it through `./run setup`, and successfully analyzes synthetic audio through `./run analyze`. Subsequent setup/analysis performs no additional sync. Generation verification/device discovery is synthetic; no weights or inference are used.
- `pnpm test:audio-factory` passed on rerun: 34 Node cases and 2 Python tests, including standalone bootstrap and controlled lifecycle smokes. The first full run returned 500 instead of 400 in the existing Studio trim test; `node --test qa.test.mjs` then passed all 4 cases, and the full rerun passed. Concurrent tests invoke setup against the shared checkout; transient ownership contention is suspected, not conclusively established. No unrelated test behavior or scheduling was changed.
- `git diff --check` passed. The regression verified unchanged source/run evidence, preserved failure logs, and released compute claims; its temporary roots were removed. Process inspection found no remaining fixture children.
- No browser check is required for this setup task. Real model installation/inference, paid-provider smoke and human listening were not run; they are outside this synthetic dependency-recovery acceptance. No owner acceptance gate is specified.
