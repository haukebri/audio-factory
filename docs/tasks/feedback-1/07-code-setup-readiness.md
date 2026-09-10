# Recover incomplete signal dependency setup

Overview: [Review queue](00-overview.md)

Status: [ ]
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
