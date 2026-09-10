# Remove six obsolete scenarios from the browser acceptance script

Overview: [Review queue](00-overview.md)

Status: [ ] Not started
Priority: P2

## Finding

`scripts/studio-ui-browser-check.mjs` no longer represents the supported UI workflow. Six behavior groups are invalid:

- Lines 36–37 require source-only candidates to have no Download, but `studio.js:128` provides it.
- Lines 38–39 inject removed budgets/top-level exhausted state and expect “20 minutes” recovery.
- Lines 40–41 address removed `local-setup` and `cancel-local` elements and judge setup readiness.
- Lines 47–52 set duration `1` on a select that now offers 5/10/20/30/60, preventing the pending-submission scenario from reaching its trigger.
- Lines 54–55 submit removed `budget`, so cancellation never reaches accepted work.
- Line 62 requires semantic evaluation export 200; `studio.mjs` intentionally returns 410.

These are obsolete central scenarios, not product regressions. Existing execution cannot be called a passing current browser acceptance check. Confidence: high from current product source/README and complete script inspection; this old browser script was not run during the review.

## Proposed work

After approval of this exact cleanup scope, delete those six scenario groups, including their scenario-local setup and waits. Keep the fifteen independently useful groups inventoried in `test-review/inventory.json`; do not replace bad scenarios with fresh assertions inside this cleanup. Update its terminal success message so it names only remaining checks. Do not revive semantic QA or removed durations to make old tests pass.

Lost partial protection: source-only UI presentation, synthetic old-state rendering and old pending/cancel plumbing. The current pending/cancel browser guarantees were already unverified because setup cannot reach their central operation. A separate current-browser-coverage task proposes new primary-flow coverage; it is not a prerequisite to approved deletion.

## Acceptance

The exact removal plan is approved before test edits. Run the remaining script against an owned synthetic fixture without provider/model calls, verify every retained group reaches its assertions, and preserve evidence of any additional failure rather than bypassing product behavior. Run the existing frontend and Studio Node checks. Update the test audit to distinguish cleaned scenarios from still-missing browser coverage.

Evidence: [test audit](test-review/test-audit.md), browser/* inventory entries.
