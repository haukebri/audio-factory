# 05 — Add validated request and cut examples

Status: [x] Complete

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [02](../../milestone/02-portable-workflow.md)
Depends on: [04 — Verify offline QA and portable exports](04-portable-export-checks.md).
Expected duration: 10–20 minutes.

## Outcome

Provide small usable JSON examples that exercise the existing interface without adding features.

## Work and scope

Add `examples/request.json` (five-second wood knock with a fixed seed), `examples/qa-signal.json`, `examples/qa-clap.json` (short target and relevant alternatives), and `examples/cut.json` (both start/end bounds and an allowed peak target). Explain in `examples/readme.md` that explicit bounds must fit the actual generated source, and show default-cut/normalization-off variants without unnecessary extra files.

Document the exact root-local commands, temporary output lifetime and retain-before-retry ordering. Distinguish a request example from an assertion that the model will produce one event.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- Parse every example and validate it using the actual copied request/QA validators; validate cut options through the runtime's cut-request validator or a fixture run, not an invented schema.
- Confirm CLI arguments match the examples and all local documentation links resolve.
- A fixture invocation accepts the cut options on suitable source audio. Do not run real generation or claim listening quality for this documentation task.

## Preflight and recovery

Use existing validators and fixtures. If fixed cut bounds do not fit a real clip, explain adjustment rather than weakening validation. No additional packages or model downloads are required.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Completed 2026-09-09 against clean input HEAD `be1b42a95cd16259b883246e56dbca462a956eb6`. Read the complete task, queue, specification and milestone, source README/QA, and runtime request → generation → analysis/cut → bundle/retain flow. No on-disk repository/ancestor AGENTS.md exists; supplied working agreements apply. Added only four JSON examples and their README, plus task/overview evidence and the supported milestone checkbox. Runtime and runner unchanged.

Mandatory evidence:

- Preflight/build: `pnpm build` passed; `ffmpeg -version` reports 9.0.1; `.runtime/mlx-venv/bin/python -c 'import numpy, soundfile; print("Signal environment available")'` passed using task 04's existing signal environment. No packages or models installed.
- `node .test-artifacts/m01-05-check.mjs > .test-artifacts/m01-05-check.log 2>&1` passed. The ignored, rerunnable check parses all four example files, calls the actual compiled `validateRequest` and `qaRequest` exports, and validates the inline default and normalization-off variants. No invented schema.
- The same check posts the exact five-second request to `createFactory` with deterministic PCM assembled from the existing `wavFixture`, closes its ephemeral loopback service, then invokes offline `qaOperation`. Signal-only QA completed with CLAP disabled. The exact cut file selected samples 8820–26460 and measured -9 dBFS within 0.0001 linear amplitude. Default `{}` selected region 1 at -3 dBFS; both normalization-off variants recorded zero gain. All four complete bundles passed `verifyExport`, and original source bytes remained unchanged. This is synthetic fixture acceptance, not inference or listening evidence.
- CLI arguments manually checked against `run`, `package.json`, `src/cli.ts` and `retain.mjs`: `make <request> [qa]`, `inspect <id>`, `analyze <id> [qa]`, `cut <id> [cut]`, `status`, and `retain <audio-path>` agree with the examples. The CLI accepts file paths, not inline JSON; variants explicitly edit the existing cut file. Real `make` commands were deliberately not executed.
- The check scanned root README, all `docs/` and `examples/` Markdown: all 119 local documentation links, including anchors, resolve.
- Fixture root `.runtime/examples-test-k2T72W` and its exports were removed after verification; an ENOENT assertion confirmed cleanup, and the service was confirmed stopped. Process inspection found no matching fixture, QA Python or FFmpeg process. `git diff --check` passed.

Input identity (SHA-256): `src/cli.ts` `4ed88bc072771a27a8179303c408ff02c2b5d4c92f81408a497e581f6271a6ca`; `src/config.ts` `06533b48577837f2b11691ba38681c1677d57205ab6271d637e48d87ea9eb811`; `src/qa.ts` `c8a80c5ff1f41d6e894b2370bc79ebd930ca9c76a984b53d884efbfc6de6f38f`; `request.schema.json` `860af00a788cacc5edaa240d162bcaef9d072c704f117a86bec51cf0eebbf795`; `qa.schema.json` `fe5b9917e35cfcf9e187c39f7318001aa133b248abe1157aa09735d22b8e0f62`.

Example SHA-256: `request.json` `0403f774585714e06f6d6551c5fcebc0698c0452a29b8d7db957aab64f978c25`; `qa-signal.json` `1363398cf32fe6f54c4de9f21479f6b036e61469045216b5f3a3aca99e43638e`; `qa-clap.json` `85ed2dbedf2d6de6bffadfa8a2f2cc23c0ca4c3b5064e5a3991386ebe1b76c59`; `cut.json` `ef687ac233adeec34bd144c9d5c00e519de56f7927b0007f71469dc08ac4c44d`. Fixture source hash `b9a0ec5eedc5310f196c1df899e06387ecc1085c7d0867dac7f699ccd7b038c6`; bounded -9 dBFS export hash `8e84d516961d06f5437a983b798eba1416d107875b2da849af384d64e4fc7022`. Exact artifact paths and variant hashes are in the ignored log.

Inherited: task 04 service, offline CLI, retention and signal coverage remains applicable because its runtime, fixtures, tests and pins are unchanged. The full suite was not redundantly rerun for documentation-only changes. Source listening rationale remains inherited, not acceptance of these examples.

Mutations/recovery: rebuilt ignored `dist/`, wrote the ignored check script/log, and created then removed only the owned fixture root. No real output/cache deletion, source-project mutation, persistent service, downloads, staging or commit. Reruns allocate fresh fixture roots; no unfinished recovery remains.

Unrun: browser checks, real generation/model smoke, actual CLAP inference and listening were not run and are not required by this task. No mandatory check is missing. Owner acceptance is not required.
