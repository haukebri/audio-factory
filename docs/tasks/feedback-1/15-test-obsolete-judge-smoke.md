# Remove the obsolete live CLAP smoke script

Overview: [Review queue](00-overview.md)

Status: [ ] Not started
Priority: P3

## Finding

`judge-smoke.mjs:25–32` requires newly generated `candidate.evaluation.model` and successful CLAP evidence. The current `runWorkflow` deliberately returns `evaluation: null`, and README removes CLAP execution and evaluation tools. The script can call the local prompt planner before inevitably failing its retired central outcome. This is not the compatibility contract to read/export historical evaluation metadata.

Confidence: high from current script/workflow/README inspection. Script was not executed because its retired outcome and planner side effect are already established.

## Proposed work

After approval, remove `judge-smoke.mjs` and references presenting it as a current runnable check. Preserve historical milestone evidence and the review-store tests that verify historical evaluation metadata remains readable/exportable. Do not rehabilitate this script into a new smoke test or restore CLAP.

## Acceptance

No current usage/check instruction directs users to this obsolete script. Existing signal, quality-loop and review-store tests still pass. Removed protection is new CLAP execution, which is explicitly unsupported; historical metadata compatibility remains covered.

Evidence: [test audit](test-review/test-audit.md), judge-smoke inventory unit.
