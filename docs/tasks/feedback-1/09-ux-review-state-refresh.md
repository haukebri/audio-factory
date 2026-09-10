# Refresh human decisions independently of candidate audio

Overview: [Review queue](00-overview.md)

Status: [x] Complete
Priority: P2
Area: Studio review synchronization.

## Finding and evidence

`refresh` in `studio.js:226` refreshes feedback only when the candidate JSON changes. Human decisions are stored separately and do not change candidate JSON. Another Studio tab can approve/reject a candidate while the first tab indefinitely shows **Human: Unreviewed** and filters it incorrectly. A subsequent review uses the stale `supersedes` event and receives a conflict. `select` also returns early when reopening the currently selected candidate (`studio.js:140`), so reopening it does not refresh the stale record.

Confirmed using a real feedback POST to an isolated fixture, equivalent to a second tab's write: after `refresh()`, both `humanText` and the visible candidate status stayed “Human: Unreviewed”, while a fresh feedback GET returned `accepted`.

## Reproduce

Open the same candidate in two tabs. Approve it in one; wait for polling in the other. Check its displayed status and Library Approved filter, then try reviewing from the stale tab.

## Minimal change

Give review changes their own freshness signal or refresh the relevant feedback on focus/reconnect and conflict. Update existing status elements and Library filters without rebuilding the active player or erasing drafts. Avoid adding a full per-candidate request fan-out to every poll of a growing library.

## Acceptance

- A review saved in another tab becomes visible in the active candidate and Library filter after the defined refresh/focus event.
- A stale review conflict fetches the latest event and supports a deliberate retry.
- Refresh preserves playback, focus, and unsaved review notes.
- A regression changes feedback while candidate JSON remains identical.

## Implementation and verification

Reviews refresh on window focus and reconnect; reopening even the selected version fetches its exact review. Changed histories update listening/comparison status, evidence choices and Library filters without replacing players or review forms. Library controls retain focus, falling back to the status filter if a focused take disappears. A 409 fetches the latest event and asks for a deliberate retry with the retained draft. Unchanged polling adds no feedback requests.

- `pnpm build` passed.
- `node --test studio-frontend.test.mjs studio.test.mjs studio-sound-grouping.test.mjs review-store.test.mjs` passed all 11 cases, including controlled Studio and review-store smokes. The final frontend-only rerun passed all 7 cases.
- `node scripts/studio-review-refresh-browser-check.mjs` passed at 1280×844 and 375×844 against `scripts/studio-ui-fixture.mjs`. Real external feedback POSTs left candidate JSON identical; focus refreshed listening/comparison labels, evidence choices and Approved filtering. Conflict did not append an event until an explicit retry, whose `supersedes` matched the latest external event. Reopen/reconnect, active playback, player/form identity, note/trim drafts, focus restoration and zero feedback requests across unchanged polls passed. The regression failed on the original stale status before implementation.
- Owned synthetic root: `.runtime/studio-ui-18LRuH`; test reviews and audio remain there for reproduction. Browser session `review-refresh` closed; final fixture PID 27659 exited and port 61656 was verified closed. Controlled smoke fixtures and children cleaned themselves up. No user library or paid provider was touched.
- `git diff --check` passed. The full package suite, obsolete broad browser script and real/paid generation smokes were not run; this task changes only review synchronization and has targeted synthetic coverage. No owner acceptance gate is required.
