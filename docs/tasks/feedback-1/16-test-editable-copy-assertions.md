# Remove assertions that pin editable progress and tool-output prose

Overview: [Review queue](00-overview.md)

Status: [ ] Not started
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
