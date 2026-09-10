# Use live operation evidence before restarting quiet task work

Overview: [Review queue](00-overview.md)

Status: [ ]
Priority: P2
Area: code / reliability

## Finding

The task runner kills Codex and retries the task solely after 30 minutes without event output. Supported setup permits 90 minutes, and a long tool operation can emit a start event followed by no Codex events until completion. This treats normal silence as failure, can interrupt downloads/builds, and replays the task instead of observing the live operation, contrary to the working agreements.

Source: `scripts/run_codex_tasks.py:26,483–498; docs/usage.md:3` (revision `c5ad0b28871a7a9c0b55433f2b0b334bb7a66bef`).

## Evidence

Static control-flow proof: silence >= STALL_AFTER_SECONDS directly invokes interrupt_process and raises RunnerError; there is no child/job readiness check. RunnerError enters automatic recovery/retry. The documented setup budget is three times the silence cutoff. No 30-minute wait or actual process interruption was performed.

## Requested change

Keep silence as a warning. Track live command/operation state and apply task-appropriate execution deadlines or a confirmed terminal failure before recovery. Preserve bounded stop conditions without equating missing output with failure.

## Acceptance

A synthetic live quiet operation can exceed the warning/silence interval within its authorized budget without being killed or restarted. A terminal failure and a genuinely exceeded task deadline still stop/recover predictably.

No implementation change is included in this review.
