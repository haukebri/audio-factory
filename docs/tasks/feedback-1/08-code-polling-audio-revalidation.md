# Avoid synchronously rereading all audio on every Studio poll

Overview: [Review queue](00-overview.md)

Status: [ ]
Priority: P2
Area: code / reliability

## Finding

Every two seconds Studio requests all candidates. listCandidates synchronously loads and hashes the full source and cut audio for every historical candidate on the HTTP event loop. Feedback and selection-history requests perform additional full candidate loads. Library growth therefore increases disk reads and blocks playback/control requests even when no candidate has changed.

Source: `studio.js:226–235,363; studio.mjs:90; review-store.mjs:126–134,192–196` (revision `c5ad0b28871a7a9c0b55433f2b0b334bb7a66bef`).

## Evidence

An isolated library of 100 five-second source-only candidates reread 88,204,400 source bytes per list, blocking for 233/221/217 ms in three runs on this machine. This understates normal source+analysis+cut snapshots and subsequent feedback/history work. No historical performance claim is made.

## Requested change

Serve validated immutable metadata without rehashing unchanged audio for every list/poll. Keep byte/hash verification on asset delivery/export and detect changed files before reusing validation. Reuse existing immutable identities and consider only sending changed metadata; no new database is required.

## Acceptance

With 100+ candidates, unchanged polling does not reread all WAV files or stall a concurrent control request. Corrupt audio must still be rejected on download/export, and new/changed candidates must appear promptly.

No implementation change is included in this review.
