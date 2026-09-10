# Keep retained audio and candidate lineage consistent

Overview: [Review queue](00-overview.md)

Status: [x]
Priority: P2
Area: code / reliability

## Finding

Both source.wav and audio.wav are accepted for a candidate with a cut. Selecting source.wav copies the original bytes to returned audio.wav, but copies candidate.json unchanged with the cut audio hash/bounds. The retained directory omits the actual cut bytes, so the candidate cannot be verified and a consumer can receive untrimmed audio while metadata describes the trim.

Source: `retain.mjs:9–25` (revision `c5ad0b28871a7a9c0b55433f2b0b334bb7a66bef`).

## Evidence

`node docs/tasks/feedback-1/code-review/reproduce.mjs` made a 1-second source and 0.5-second cut. Retaining the cut candidate’s source.wav returned audio matching the source hash and differing from the candidate cut hash.

## Requested change

Keep canonical source and delivered audio files faithful to the candidate record, and return the requested asset explicitly; alternatively reject this unsupported source-retention form with a clear error. Do not silently rewrite an immutable candidate identity.

## Acceptance

Retain source-only, cut-audio, and cut-source inputs in isolated storage. Every successful retained bundle verifies against its metadata after relocation, and the returned path contains the requested audio.

No implementation change is included in this review.

## Implementation evidence

Implemented 2026-09-10: retention preserves canonical `source.wav` and, for cut candidates, `audio.wav`, leaving candidate identity unchanged. The returned `audio` path explicitly identifies the requested asset.

`pnpm build`, `node --test review-store.test.mjs`, and `git diff --check` passed. The isolated regression first reproduced `Export audio hash mismatch`, then verified source-only, cut-audio and cut-source retention using a one-second source and half-second cut. Each returned path contains the requested bytes; relocated bundles revalidate through the review store with unchanged candidate identity and preserved feedback. All owned fixture directories were removed and child processes exited.

No browser, real-model, paid-provider or owner-listening check is required by this task or was run. The full package suite was not run; the optional signal-environment preflight found missing `scipy`, which is not needed by retention or its smoke. No user audio was modified and no commit was made.
