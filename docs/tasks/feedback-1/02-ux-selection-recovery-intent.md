# Preserve new user intent when recovering pending Studio mutations

Overview: [Review queue](00-overview.md)

Status: [ ] Not started
Priority: P1
Area: Studio selection and batch recovery.

## Finding and evidence

`studio.js:256` (`useTake`) reuses any `studio-selection-<sound>` entry regardless of the candidate the user just chose. After a network error leaves take A pending, clicking **Use this take** on B posts A and reports “Best take saved.” This can give the consuming project the wrong winner.

Confirmed against an isolated synthetic Studio: blocked A's selection POST before transmission, restored the API, then selected B. The persisted selection was A (`11641ccd…`), while the requested B was `1c5ba450…`; the success message still appeared. No real library was modified.

The same defect exists in `batchMutation` (`studio.js:301`), whose global `studio-batch-submission` entry overrides the newly requested path and input. It can cross both sound and batch boundaries and even substitute a different action type. A failed regenerate for sound A followed by recreate for sound B silently regenerates A and announces “Queued.” Conversely, an older uncertain paid recreation can be submitted while the current click requests local regeneration.

Validated the batch case by extracting the unmodified `batchMutation` function from the current source into Node's `vm`, with in-memory local storage and an intercepted API. Failed `batches/batch-a/sounds/a/regenerate` before transmission, then requested `batches/batch-b/sounds/b/recreate`. The only emitted request was the former path with its original prompt/duration/key; pending storage was cleared and the newer intent was lost. This probe made no network calls.

## Reproduce

1. Have two takes of one sound.
2. Make the selection request fail before reaching the server; choose A.
3. Restore connectivity and choose B without reloading.
4. Inspect `/studio/selections`: A is selected.

For batch actions, fail one sound's regenerate/recreate request, switch to another sound or batch, and request a different action. Intercept requests to avoid paid generation. The stored action is sent instead of the new action.

## Minimal change

Distinguish explicit reconnection of a pending operation from a new user action. Reuse a pending operation only for the same candidate or full batch/path/input intent. Resolve uncertain selections with their original identity, then apply the current choice using the current selection event. For batch operations, retain the original key and recovery record without silently replacing a new action; reconcile the older operation separately and make both outcomes visible. Never discard an uncertain paid-operation key or mint a replacement that could duplicate its charge. Existing `connect()` intentionally calls `batchMutation('', {})` to resume a stored operation; preserve that explicit recovery behavior while separating it from ordinary click handling.

## Acceptance

- Failure before transmission and failure after server acceptance both recover safely.
- Choosing B after an uncertain A ends with B selected, or an explicit recoverable conflict identifying what remains unsaved.
- The success message and highlighted winner name the candidate actually persisted.
- A pending action for batch/sound A cannot substitute its path, provider, or input for a new action on B.
- Reconnect retries an uncertain operation using its original key; new actions do not erase that recovery state or duplicate paid work.
- Keep focused runnable regressions for A-failure followed by B-selection and cross-batch/action intent mismatch, including a lost response after server acceptance.
