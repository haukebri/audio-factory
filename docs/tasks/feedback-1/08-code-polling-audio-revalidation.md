# Avoid synchronously rereading all audio on every Studio poll

Overview: [Review queue](00-overview.md)

Status: [x]
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

## Implementation and verification

Completed 2026-09-10. `loadCandidate` now caches validated metadata per immutable candidate identity. Before reuse it checks the metadata/source/cut file device, inode, mode, size, nanosecond mtime and ctime; changed files undergo full validation. Only stable validations are cached, and callers receive independent objects. Asset delivery/export still explicitly verifies source/cut bytes and hashes. No API, database or frontend change was needed.

- `pnpm build` passed.
- The added Studio HTTP regression first reproduced 273,083,226 WAV bytes read across three unchanged polling/control rounds. With the fix, the final serial run read zero WAV bytes and completed those rounds in 7/6/5 ms with 100 five-second synthetic candidates plus the existing source/analysis/cut snapshots. Feedback and selection-history requests are included.
- Regression checks passed for publication through a second store appearing on the next poll, caller mutation isolation, metadata identity changes, same-size source/cut corruption with restored mtime, rejection on download/export, immediate recovery after restoring valid bytes, and byte verification on warm-cache asset delivery.
- `node --test review-store.test.mjs studio.test.mjs` passed all 3 cases, including retention/relocation, symlink rejection, playback/export, restart, cancellation and owned-process cleanup.
- `pnpm test:audio-factory` passed 33/34 Node cases; the existing long-trim check returned 500 instead of 400, matching the failure recorded in task 07. `node --test qa.test.mjs` then passed 4/4. The complete package test file list run with `node --test --test-concurrency=1` passed 34/34, followed by `.runtime/signal-venv/bin/python qa_test.py` passing 2/2. Shared-checkout contention is suspected; no unrelated implementation or test scheduling was changed.
- `git diff --check` passed. Owned test roots were removed and no matching fixture processes remained. The older `studio-resume-test-IXZEtM` fixture (owner PID 4379, timestamp 09:43:23) was preserved as unrelated state.
- No browser check is required by this task and none was run. Real inference, paid-provider smoke and human listening were not run; acceptance is synthetic HTTP/store behavior. No owner acceptance gate is specified. No commit was created.
