# Refresh human decisions independently of candidate audio

Overview: [Review queue](00-overview.md)

Status: [ ] Not started
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
