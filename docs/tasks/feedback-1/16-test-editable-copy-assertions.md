# Remove assertions that pin editable progress and tool-output prose

Overview: [Review queue](00-overview.md)

Status: [x] Complete
Priority: P3

## Finding

Three useful tests contain incidental exact-copy checks:

- `studio-frontend.test.mjs:32,34,35,38,41,45,47` pins complete progress sentences and punctuation/elapsed formatting. The independently useful button/progress/spinner state checks survive.
- `standalone-core.test.mjs:64` pins pnpm's “Lockfile is up to date...” output despite already checking unchanged lock bytes and a successful local bootstrap.
- `standalone-core.test.mjs:90` pins the exact CLI usage lead-in, alongside real invalid-command failure/no-side-effect checks.

The owner contract requires truthful progress/invalid-command handling and pinned dependencies, not those literal sentences. Confidence: high from current contracts/assertions. No history of repeated flakiness is claimed.

## Proposed work

After approval, delete precisely these nine assertions (seven frontend, two bootstrap). Retain useful state, valid build/status, lockfile, unsupported import, permission and output-preservation checks. Do not replace removed prose assertions with new tests during this cleanup.

## Acceptance

Exact deletion plan approved. Existing frontend tests and the standalone bootstrap check pass with their original behavioral coverage. Freely editing the removed progress/usage prose no longer breaks the test. Stage-message content itself becomes an explicit unprotected assertion boundary; do not claim visual acceptance from VM state checks.

Evidence: [test audit](test-review/test-audit.md), frontend/progress and standalone/bootstrap/invalid-command.

## Implementation evidence — 2026-09-10

The owner's implementation request approved the exact nine-assertion plan. Deleted seven progress-copy assertions and two bootstrap/tool-output assertions only; all existing state, build/status, lockfile, unsupported-import, permission and output-preservation checks remain. No replacement tests or production changes. Stage-message content and elapsed formatting are now explicitly unprotected; no visual acceptance is claimed.

`pnpm build` passed. Frontend (7 cases) and standalone bootstrap passed in both canonical suite runs. Each `pnpm test:audio-factory` run passed 33/34 Node cases, with the same unrelated `qa.test.mjs:40` trim response failure (500 versus 400); Python was not reached by those commands. The unchanged QA file passed all 4 cases alone. The complete canonical Node file list with `--test-concurrency=1` passed 34/34 without skips, and `.runtime/signal-venv/bin/python qa_test.py` passed both cases separately. This is consistent with shared-resource contention, not proof of its exact cause; the default concurrent command is not claimed passing.

A temporary copy with all six targeted renderer stage strings and elapsed formatting changed passed all 7 frontend cases. An initial overbroad diagnostic also changed an unrelated batch acknowledgement and failed its retained `/Submitting/` assertion; narrowing the diagnostic to `renderGeneration` passed without changing repository source. The removed usage/pnpm matches are absent by diff inspection; no tool-output mutation diagnostic ran.

Logs, original test bytes, mutation fingerprints and cleanup evidence are in `.test-artifacts/feedback-1-task-16/`. Logged fixture roots and diagnostic copies were removed; `git diff --check` passed. No browser, paid/model smoke or human listening check ran or is required for this assertion-only task. No owner acceptance gate; no commit made.
