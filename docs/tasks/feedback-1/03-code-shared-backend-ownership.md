# Serialize access to the checkout-wide local backend across workflow roots

Overview: [Review queue](00-overview.md)

Status: [ ]
Priority: P1
Area: code / reliability

## Finding

Workflow ownership is scoped to each supplied storage root, but GgufBackend always uses the checkout-wide runtime/backend-owner.json and out/work. The real smoke uses a different root and computePort:0, bypassing both the Studio lease and fixed compute-port exclusion. Its backend.start calls stopOwned on the currently recorded process without verifying that the process’s workflow owner is stale. Running the advertised smoke during a Studio generation can terminate that live model process and interfere with its recovery.

Source: `src/backend.ts:18–22,65–68; workflow.mjs:33,179–200; smoke.mjs:15–17` (revision `c5ad0b28871a7a9c0b55433f2b0b334bb7a66bef`).

## Evidence

Traced the documented pnpm audio:smoke entrypoint through openJobs, runWorkflow, and GgufBackend.start. `node docs/tasks/feedback-1/code-review/reproduce-backend.mjs` then ran the unchanged compiled backend in an isolated fake runtime: a live session claim remained present/alive, but start sent SIGTERM to its synthetic backend child and returned successfully. Only a fresh diagnostic child was signaled; no real model or user process was touched. processIdentity proves PID identity, but not that the owning workflow is abandoned.

## Requested change

Acquire one checkout-wide compute/backend ownership claim for every real local execution, including smoke/custom storage roots and setup. Recover an old backend only after establishing that its owning session is no longer active. Reject/reuse a live owner instead of killing its child.

## Acceptance

Use isolated fake processes: a live Studio backend survives a concurrent smoke/custom-root start, which reports contention without signaling it. A genuinely abandoned owned child remains recoverable, and unrelated PIDs are never signaled.

No implementation change is included in this review.
