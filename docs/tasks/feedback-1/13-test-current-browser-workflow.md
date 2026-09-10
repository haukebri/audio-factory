# Add a current synthetic browser check for the primary review workflow

Overview: [Review queue](00-overview.md)

Status: [x]
Priority: P2

## Finding

The root test command executes VM-extracted helpers and HTTP integrations; the standalone browser runner targets old workflows. Neither provides a passing browser check of the current batch deep link, five local cards, exact preferred version and returned winner manifest. The existing runner's pending-request and cancellation scenarios cannot reach accepted generation due to removed duration/budget inputs. Current long-clip UI and exact selection wiring can regress while the 26 registered Node cases pass.

Confidence: high from all test sources, current README/agent API, and a passing 26-case Node baseline. This is a missing meaningful boundary, not a demand for broad UI coverage.

## Work

After the proposed concrete test addition is reviewed/approved, add the smallest browser journey against the existing owned synthetic Studio fixture: open a real batch review hash URL, wait for generated cards, use the UI to choose one exact version, reload, and verify the API winner candidate/audio hash matches that choice. Include current valid duration inputs and one controlled lost-response recovery or cancellation case if it can reuse this journey without a second expensive workflow. Keep all generation synthetic and all real provider calls impossible. Verify the supported 60-second trim boundary in the production-fix regression; do not simulate success by replacing app methods or modifying DOM outcomes.

Use existing fixture/browser tooling; no new test framework or dependency is required. Print a documented command and prerequisites in the check documentation. This addition is separate from removal of obsolete groups.

## Acceptance

The new scenario normally passes on the supported UI; a deliberate wrong selected-candidate/winner binding in an isolated copy makes its final assertion fail for the intended reason. Reload must prove a persisted selection, not a synthetic variable assignment. No real library, paid API, or model generation is touched; owned fixture and browser processes are cleaned up. Record exact command/result and do not claim human listening acceptance.

Evidence: [test audit](test-review/test-audit.md), B7–B9 heat map.

## Implementation evidence — 2026-09-10

The owner's request to implement this task authorized its concrete proposed test addition. Added only `scripts/studio-batch-browser-check.mjs` and its [command/prerequisites/cleanup documentation](../../plans/studio-ui-verification.md#current-batch-winner-browser-check-task-13); no product code, fixture or existing test groups changed.

- `node scripts/studio-batch-browser-check.mjs`: passed (exit 0), including a final rerun. Uses the real returned batch hash URL, a valid 5-second duration, five exact local card bindings, variation 2's distinct saved trim, a controlled lost selection acknowledgement, and one persisted selection event after reload/retry. Browser candidate/version preferences are cleared before reload; the server's selection restores the chosen version. The winner candidate, audio hash, duration and downloaded WAV SHA-256 match that choice without extra generation.
- Negative control: the same command in `.test-artifacts/feedback-1-task-13/wrong-binding/` exited 1 at `Winner must bind the exact version chosen in the browser`. Only the isolated `batches.mjs` winner lookup was changed to return another candidate from the same generation. All earlier journey/recovery assertions were reached; the wrong candidate failed the intended final binding assertion. The copy was removed after verification; the exact substitution is saved in `mutation.txt`.
- `pnpm build`: passed. `node --check scripts/studio-batch-browser-check.mjs`: passed. `node --test qa.test.mjs studio-frontend.test.mjs studio-sound-grouping.test.mjs`: 12 passed, including the existing 60-second regression's 40–50 and 59–60 cuts, export/audio bounds and invalid-bound rejection. `pnpm test:audio-factory`: 34 Node and 2 Python checks passed, including the controlled Studio smoke. `git diff --check`: passed.
- Development failures are retained: the first attempt read the previous manifest before fixture readiness; the next hit a stale keep-alive socket after a synchronous browser wait; another used an unsupported text selector. Final execution waits for fixture readiness, closes test API connections, and clicks actual UI controls using the existing DOM tooling pattern. No product methods or rendered outcomes were replaced to obtain a pass.
- Logs and result manifests: `.test-artifacts/feedback-1-task-13/` (`browser-final.log`, `browser-final-results.json`, `mutation-browser.log`, `regressions.log`, `full-suite.log`, `build.log`, `cleanup.txt`). Owned browser sessions closed; fixture PIDs 55103, 57151 and 62859 exited and their ports closed; the synthetic roots and mutation copy were removed. The previous shared fixture manifest was restored byte-for-byte.

All task-required machine checks completed. No real library, model, paid provider, real-generation smoke or human listening acceptance was touched or claimed. No owner acceptance gate is required by this task. No commit was made.
