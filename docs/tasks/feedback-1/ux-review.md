# Studio UX review — scope and verification

Review date: 2026-09-10. This is review evidence, not an implementation task.

Read all of `studio.js`, `studio.html`, `studio.css`, the fixture/browser-check scripts, and current user-facing `readme.md`, `docs/studio.md`, `docs/usage.md`, and `docs/agent-api.md`. Traced recreation queue deduplication into `batches.mjs`. Reviewed creation, Library search/filtering, version selection, comparison, reviews, trimming, selection, generation/recovery status, batch navigation, draft persistence, and playback handling. Historical milestone instructions are explicitly superseded by the current README; they were not treated as current product behavior.

## Findings

| Priority | Task |
| --- | --- |
| P1 | [Pending recovery substitutes an earlier selection or batch action for new intent](02-ux-selection-recovery-intent.md) |
| P1 | [Repeated batch recreation clicks queue duplicate paid operations](01-ux-batch-recreation-double-submit.md) |
| P2 | [Human decisions do not refresh independently of candidates](09-ux-review-state-refresh.md) |
| P2 | [Variation audio keeps playing after navigation hides it](10-ux-hidden-variation-playback.md) |

## Verified behavior and evidence limits

- Started the existing `scripts/studio-ui-fixture.mjs` against a fresh owned root `.runtime/studio-ui-8uNy6T`, local port 53702. It produced one synthetic five-take job, 15 candidate evidence records, and five actual takes. No models were downloaded and no paid generation ran.
- Used the isolated `agent-browser` session `feedback-ux`. Inspected rendered desktop (1280px) and mobile (375px) layouts plus the accessibility snapshot. No horizontal overflow was observed in listening or comparison at 375px. Controls retain native semantics, labels, focus styling, and the CSS reduced-motion override. This is not a formal screen-reader or WCAG certification.
- Confirmed ordinary polling preserves the active review textarea, focus, and audio DOM node. A/B comparison rendered two labeled players. Source review confirmed shared play handling pauses competing players; navigation coverage is the separate task above.
- Selection failure and external-review probes used real fixture endpoints. Paid duplicate-submit verification used the real frontend queue handlers but intercepted the API and replaced only its refresh response, so no paid action occurred. Backend inspection confirmed different keys append independent queue operations.
- A final source-extracted Node `vm` probe confirmed the same stale-intent replacement in `batchMutation`: pending batch A regeneration replaced newly requested batch B recreation. API and storage were in-memory fakes; no browser restart or external operation was needed. The selection recovery task covers both affected handlers and preserves explicit lost-response recovery.
- Local artifacts: `.test-artifacts/feedback-ux-desktop.png`, `.test-artifacts/feedback-ux-mobile.png`, `.test-artifacts/feedback-ux-compare-mobile.png`. Screenshots show the inspected layouts; each issue task records its behavioral observation because screenshots alone do not prove state transitions.
- Existing browser acceptance script contains removed-control/behavior expectations. Reported this to the test-review agent rather than treating it as reliable evidence or editing tests. Root reviewer owns backend polling/library scalability.
- Verified `.env-template` exists and is tracked; the README setup link is valid. Batch durations are constrained by the documented batch API; arbitrary legacy workflow durations were not treated as a batch-editor defect.
- Model sound quality, real setup latency, and provider cost/response behavior were deliberately excluded from this synthetic UX exercise. Main review covers those boundaries separately where feasible; no live audio quality claim is made here.

## Mutations and cleanup

Only task markdown and ignored owned test artifacts were written. The fixture stored one synthetic job, a test winner, and a test human review in its fresh root. The fixture helper updated `.test-artifacts/studio-ui-session.json` to the owned session; that manifest is now historical, not proof of a live process. The named browser was closed and PID 55105 terminated gracefully; its process handle reported completion. Synthetic audio was preserved in its owned root for reproduction. No product source, production library, real user run, or test suite was changed.
