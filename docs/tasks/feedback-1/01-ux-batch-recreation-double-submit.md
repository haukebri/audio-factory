# Coalesce repeated clicks on paid batch recreation

Overview: [Review queue](00-overview.md)

Status: [ ] Not started
Priority: P1
Area: Studio batch review.

## Finding and evidence

`studio.js:33` queues every button click through `action`. The batch branch in `recreate` (`studio.js:249`) calls `batchMutation` without an in-flight guard. `batchMutation` (`studio.js:301`) creates its key only when the queued callback runs, and removes that key after each response. Two clicks therefore become two independently authorized-looking operations. `batches.mjs:92–106` deduplicates by key and appends both distinct operations; both will invoke the paid provider.

A browser probe using the real `action`, `recreate`, and `batchMutation` functions, with the API intercepted before any external call, queued two consecutive actions for the same candidate. It produced identical recreation paths/bodies with different keys (`09cd0f44…` and `6fbf60a1…`). No paid request was made. Non-batch recreation has an active-job guard; the batch queue intentionally accepts work while another job runs, so that guard does not protect this path.

## Reproduce

Double-click **Recreate with ElevenLabs** on a batch review card. Use an intercepted API or fake paid backend when verifying. Observe two recreation operations with separate keys.

## Minimal change

Capture an in-flight intent/key and disable or coalesce duplicate activations at click time, before they enter the serial action queue. Apply the same submission protection to batch regeneration. Allow a deliberate later recreation after completion without adding a permanent ban.

## Acceptance

- Rapid mouse or keyboard reactivation of one pending recreation creates one queued operation.
- A lost response retries the same key.
- The UI visibly acknowledges the pending submission.
- A deliberate later operation can still be requested.
- One regression exercises actual click-handler queuing with a fake provider/API and verifies operation count, not just key formatting.
