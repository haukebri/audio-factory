# Allow manual trimming across the full supported 60-second source

Overview: [Review queue](00-overview.md)

Status: [x]
Priority: P2
Area: audio processing / Studio

## Finding

`request.schema.json` and `run.schema.json` now support 60-second local recordings, and Studio offers that duration. `qa.schema.json:76,81` still caps both manual cut bounds at 30 seconds. Consequently a valid 40–50 second region of a 60-second original cannot be selected through Studio, the compute API, or the CLI. The default automatic region path bypasses explicit bounds validation, making this discrepancy easy to miss.

## Evidence

At revision `c5ad0b28871a7a9c0b55433f2b0b334bb7a66bef`, calling the actual `qaRequest('cuts', { start_seconds: 40, end_seconds: 50 })` returned status 400 with both bounds required to be <=30. Source inspection traces all manual cut callers to this validator, followed by source-length/sample validation in `src/qa.ts:142–149`.

## Requested change

Align the cut input contract with the supported local source duration. Preserve the runtime check that the selected samples exist within the actual original; ElevenLabs' generation duration limit does not belong on this provider-independent trim operation.

## Acceptance

A synthetic 60-second source can be cut at 40–50 seconds through the shared operation and Studio route, and its exported bounds/audio duration match. Empty, reversed, and beyond-source bounds still fail. A 30-second source cannot be cut past its end.

This is an open implementation task; no product schema was changed by the review.

## Implementation evidence

- Raised both manual cut schema maxima to 60 seconds; retained the runtime source/sample bounds check unchanged.
- Added a synthetic regression that first failed on the 30-second cap, then passed for 40–50 and 59–60 second cuts through the shared operation, compute API and Studio route. Verified export lineage, sample bounds, audio duration and unchanged source bytes; empty, reversed and beyond-source bounds fail, including trims beyond a 30-second original.
- Passed `pnpm build`, `node --test qa.test.mjs studio.test.mjs` (6 tests, including the controlled Studio smoke), `.runtime/signal-venv/bin/python qa_test.py` (2 tests), and `git diff --check`. Test servers/children and owned temporary fixtures were cleaned; no long-trim fixture remains.
- No browser UI session, full repository suite, paid generation or real-model listening check ran; none is required by this task. No owner acceptance gate is specified.
