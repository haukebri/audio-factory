# Use live operation evidence before restarting quiet task work

Overview: [Review queue](00-overview.md)

Status: [x]
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

## Implementation and verification

Completed 2026-09-10. Read the task, queue, project specification, current README/usage, review evidence and complete runner implementation/review/recovery flow. No on-disk repository or ancestor AGENTS.md exists; the supplied working agreements apply. No commit was made in this checkout.

Silence now only warns, including pending command/tool item IDs and remaining execution budget. Each implementation/review attempt uses a monotonic two-hour deadline (90-minute setup plus verification), configurable before execution with `--execution-timeout-minutes`. Activity cannot reset that deadline. A terminal failed turn, nonzero process exit or expired deadline raises the existing recovery error; the six-attempt bound remains. Completed operation items are removed from pending state. Stream readers close their pipes and forced termination reaps the process.

- Reproduced the original silence-only interruption from HEAD in an isolated subprocess with shortened thresholds.
- `python3 -B -m unittest scripts.test_run_codex_tasks`: 11 tests passed. The new synthetic subprocess regression covers quiet operation success beyond the warning interval without interruption, nonzero exit, a terminal failed turn, and both quiet and continuously emitting processes exceeding their authorized deadlines. The focused regression passed again after the final test edit.
- Fake-Codex `--smoke`, `--recovery-smoke`, and `--resume-smoke`: passed in temporary Git repositories, removed by context cleanup. These fixture-only commits did not touch this checkout.
- CLI rejected zero, negative and non-integer budgets before starting work; `--help` passed.
- `pnpm build` and `git diff --check`: passed. Deadline/failure regressions verified stopped subprocesses; fixtures and the temporary test log were removed.

No browser check, real Codex session, long model setup, paid generation or listening check ran; none is required for this runner task. Deadlines were exercised with shortened synthetic budgets, not a 30/90/120-minute wall-clock wait. No owner acceptance gate is specified.
