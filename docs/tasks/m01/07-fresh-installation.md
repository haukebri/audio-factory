# 07 — Verify first-use setup in an isolated checkout

Status: [ ] Not started

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [03](../../milestone/03-standalone-verification.md)
Depends on: [06 — Document the standalone agent and manual workflows](06-agent-workflow.md).
Expected duration: 30–90 minutes including downloads.

## Outcome

Establish that a new supported-machine user can install the pinned runtime and weights without the source project's environments or caches.

## Work and scope

Preflight Apple Silicon/macOS/Metal, Node/pnpm, Git, uv, FFmpeg, network/model access, free storage in both checkout and cache locations, and service-port ownership. Record versions and required storage observations. Use a disposable copy of the task input tree without node_modules, dist, `.runtime/` or `out/`, and an isolated Hugging Face cache; do not erase existing caches to simulate first use.

Run the documented root launcher/bootstrap and explicit setup/setup-qa paths to install MLX and CLAP environments and fetch verified weights. Record commands, input revision/file hashes, setup logs, runtime revision, installed lock agreement, downloaded artifact hashes and cold-cache evidence in this task. Keep the verified checkout/cache for task 08 and record their paths and state. Correct only evidenced setup/extraction failures and rerun affected checks.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- First-use package/environment/runtime/model setup completes from the recorded empty initial state. A reused cache is not described as a fresh download.
- Both MLX and CLAP artifact hashes and pinned dependency/runtime checks pass; no Urban Wildlife runtime path is consulted.
- Repeating setup/readiness checks reuses valid artifacts. Any deliberate mismatch check uses an isolated fixture, preserves the mismatched file and never corrupts real weights.
- Record setup elapsed time and disk use, exact retained verification paths and any incomplete operation. No factory/model process remains active after setup. Real audio generation follows in task 08.

## Preflight and recovery

Installing pinned project dependencies and downloading the configured models are within this task; do not invoke system package managers, accept new terms on the owner's behalf, substitute models or silently replace mismatches. Missing mandatory access/hardware is a blocked result with completed work preserved.

Follow progress logs and confirmed live process handles, allowing the documented startup budget and a realistic download budget within this task's expected duration. Recheck a timed-out observation before retrying. On restart, resume the same recorded checkout/cache and verified downloads; do not repeat cold installation merely to recreate evidence. Record external filesystem mutations immediately. No mandatory listening or owner pause.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Not run. Record commands and outcomes, input revision/hashes, relevant artifact locations, external mutations and recovery state here during implementation. Distinguish mandatory, inherited and best-effort evidence. Leave Status unchecked if a mandatory check is missing or failed.
