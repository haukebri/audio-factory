# Add a current synthetic browser check for the primary review workflow

Overview: [Review queue](00-overview.md)

Status: [ ] Not started
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
