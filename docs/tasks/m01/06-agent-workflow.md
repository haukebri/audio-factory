# 06 — Document the standalone agent and manual workflows

Status: [ ] Not started

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

Not run. Record commands and outcomes, input revision/hashes, relevant artifact locations, external mutations and recovery state here during implementation. Distinguish mandatory, inherited and best-effort evidence. Leave Status unchecked if a mandatory check is missing or failed.
