# 06 — Document the standalone agent and manual workflows

Status: [x] Complete

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [02](../../milestone/02-portable-workflow.md)
Depends on: [05 — Add validated request and cut examples](05-request-examples.md).
Expected duration: 15–30 minutes.

## Outcome

Give agents and advanced users complete standalone instructions for generation, review, retention and recovery.

## Work and scope

Adapt the source skill into `.agents/skills/audio-factory/SKILL.md`, preserving its frontmatter and quality/recovery guidance. Reference the actual root launcher and examples, use `retain` and whole-bundle copying in place of game import/build commands, and explain locating the tool checkout from another project.

Add `docs/usage.md` for normal `make`/`generate`, inspect/analyze/cut/retain, explicit setup/repair and manual HTTP endpoints/authentication. Cover optional CLAP, session-scoped idempotency and IDs, 429 retry behavior, 30-second manual idle shutdown, accepted-work drain, 10-minute generation and 20-minute startup waits. Keep the three-generation default search limit, provisional status and actual listening evidence requirements. Explain that `make` already cuts region 1 and models exit per operation.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- Skill frontmatter is valid and its name/description accurately describe the standalone tool. Use an available skill validator or a minimal direct check; do not install a framework solely for frontmatter.
- CLI help, examples, usage guide and skill agree, and all local references resolve.
- Walk commands against the existing fixture evidence and implementation. Every documented endpoint/authentication rule exists; no token is printed and no game catalog/import step remains.
- Instructions explicitly preserve candidates before the next session and distinguish QA ranking from acceptance. Mark real setup/generation evidence as pending until tasks 07–08.

## Preflight and recovery

No human acceptance gate is added by the skill. Missing listening tools leave quality provisional and do not stop unrelated work. Documentation review needs no live service or model downloads.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Completed 2026-09-09 against clean input HEAD `49b5f0a31031944122aeab2db1fb9ed7098a7779`. Read the full task, overview, specification, milestone, prerequisite evidence, source skill/README/QA and standalone launcher → setup/backend/service → QA → bundle/verification/retention flow. No repository or ancestor AGENTS.md exists on disk; the supplied working agreements apply. Source HEAD remains `00d64d6cbf71bf0f9d35832784d7a9aa3ffe35aa`.

Implementation: adapted the source skill with its name/description frontmatter and quality/recovery guidance; added `docs/usage.md`; corrected only the root README's obsolete unavailable-launcher statements and linked the new instructions. Added standalone checkout discovery, retain/whole-bundle delivery, verified destination example, manual API/authentication and bounded recovery guidance. No runtime, tests, dependencies, model pins, task runner or later tasks changed.

Mandatory evidence:

- `python3 /Users/haukebrinkmann/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/audio-factory` could not start because PyYAML is absent. Used the task-authorized minimal Python direct check instead: passed delimiters, exactly `name`/`description`, valid YAML plain-scalar content, lowercase hyphen name, length limits and no unfinished frontmatter placeholders. No validator dependency was installed. Manually confirmed the description describes standalone generation, QA and portable retention; preserved the source frontmatter fields.
- `./run --help > .test-artifacts/m01-06-help.log 2>&1` built successfully and displayed the existing CLI Usage error (exit 1; this CLI has no dedicated successful help branch). Compared its arguments with README, examples, guide, skill and all `src/cli.ts` branches; documented `generate` alias and foreground `serve` are implemented although omitted from that usage string. No real make/start/setup was invoked.
- `node .test-artifacts/m01-06-check.mjs > .test-artifacts/m01-06-check.log 2>&1` passed. Reused task 05's fixture check, adding skill-link checking and execution of the exact Node verifier snippet extracted from the usage guide. All four JSON examples pass actual request/QA validators; signal-only analysis and bounded/default/normalization-off cuts pass. The documented verifier passed on all four fixture bundles; source bytes remain unchanged. All 135 local Markdown links across README, docs, examples and skill resolve, including anchors. The ignored script/log contain repeatable commands and detailed paths/hashes.
- Walked every documented endpoint against `src/service.ts` and `src/qa.ts`: authenticated health, generation, run metadata/audio, analyses, cuts, cut audio and shutdown exist; analysis audio is explicitly unavailable. Verified Origin rejection, bearer comparison, 16 KiB body bound/media type, status codes, key format/conflicts, same-key recovery, 429/Retry-After, accepted-work drain and session cleanup. Checked actual wait constants and per-operation process exit against CLI/setup/backend. Current CLI surfaces 429 rather than automatically retrying; guide assigns waiting/retry to manual clients. The Python health example reads the token in-process and prints only response JSON; it was inspected, not run against a live service.
- Manual review confirms retain-before-next-session, three-generation default limit, provisional status and actual listening evidence requirements. No required game import/build/catalog command or source-project runtime path remains in the skill/guide. Only current package scripts are presented as available. Fresh setup and real-generation evidence are explicitly pending tasks 07–08.
- Cleanup: fixture `.runtime/examples-test-xhJYIv` was removed after verification, with an ENOENT assertion and closed-server assertion. The help invocation created `.runtime/token` (the CLI does this even for usage); it was never printed and was removed afterward because preflight confirmed it did not previously exist. Independently asserted `.runtime/` contains only the inherited `mlx-venv` and no `out/` exists. Process inspection found no `dist/cli.js`, QA Python, FFmpeg or example-fixture process. `git diff --check` passed.

Input SHA-256: source skill `ea66242aeeb0ffc5988101941d72fa062143ac02b1401ad2516f421c8a3cdfb2`; CLI `4ed88bc072771a27a8179303c408ff02c2b5d4c92f81408a497e581f6271a6ca`; service `59bb32b772049cac55338d4d1ccf262d5fb9e04ddfe22dcf5641bfa24f241937`; QA `c8a80c5ff1f41d6e894b2370bc79ebd930ca9c76a984b53d884efbfc6de6f38f`; retain `99d0e7d527ee11d46a28e5093bf7ffac021e86945da30ab75cbd2f01501fc85b`. Output skill `677e183698fa591b3bca377a151382a5906bc728fe277c9c85c5ed6ffb4675fa`; usage guide `dec9d23a9dcf81cf4d6ae2de5a7d12c5d84fc9378a6cd3822605313250fa3222`.

Inherited: tasks 03–05 establish service/recovery, offline inspect/analyze/cut/retain and relocation behavior, including rejecting missing/tampered companions. Runtime and tests are unchanged; service test hash remains `d821f7edf3523a87aa01bb1b25811f99f38183987ddfa7c97b9fd386269d5b52`, QA test `2e7d80c0414133eae3bc36d48781aa9fcd32ffdd379638e06fa013c6a1c061d4`. The full suite was not redundantly rerun for this documentation task. Source listening rationale is inherited and does not accept these synthetic fixtures.

Mutations/recovery: rebuilt ignored `dist/`, wrote ignored check/help artifacts, created and removed the owned fixture directory and help token. No model/package download, source-project mutation, persistent service, real output/cache removal, staging or commit. Reruns use fresh fixture roots; no unfinished recovery remains.

Unrun: no browser check, full installation, real-model smoke, actual CLAP inference or listening ran; none is required for this documentation review. Those real setup/generation checks remain tasks 07–08. Best-effort listening was not performed; fixture quality remains provisional. No mandatory check is missing. Owner acceptance is not required.
