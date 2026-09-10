# Security Review: audio-factory

## Scope

Repository-wide static first-party source security review, locally running project.

- Scan mode: repository
- Target kind: git_revision
- Target ID: target_sha256_62dbfbb2f6f6a15c1081caf73dcfd3bdad2b28b7ca85ac44ab19c94f35c17832
- Revision: c5ad0b28871a7a9c0b55433f2b0b334bb7a66bef
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none
- Runtime or test status: No application execution by security reviewers.
- Scan context: We are about to finish this project. I want you to do a full scan of this project. What can be improved, what is done wrong, from all directions - code - ux - security (even though keep in mind this is a locally running project) - also check the test review skill and check if we are good there. Do this with multiple agents in parallel Any findings will get a task each, under /docs/tasks/feedback-1/\<task\>.md

Limitations and exclusions:
- No third-party binary/dependency source audit or online vulnerability feed lookup.
- Historical milestone documentation treated as historical context; source-based security conclusions do not imply current operational acceptance.
- Independent baseline available through parent reviewer; architecture and focused validation performed by coordinator under occupied worker allowance.
- Excluded .runtime/, node_modules/, dist/, out/: Ignored external/generated runtime and user data; first-party source and dependency declarations reviewed.

### Scan Summary

| Field | Value |
| --- | --- |
| Scan outcome | completed |
| Reportable findings | 0 |
| Severity mix | none |
| Confidence mix | none |
| Coverage | complete |
| Validation mode | static |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

Local single-user audio workbench: CLI/Studio orchestrate prompt planning via localhost Ollama, native GGUF/Metal generation or explicit ElevenLabs recreation, deterministic signal/cut processing, and durable human-reviewed artifacts (src/cli.ts:149; studio.mjs:152; workflow.mjs:33; prompt-plan.mjs:41).

### Assets

- ELEVEN_KEY from environment over checkout .env; sent only to the fixed ElevenLabs HTTPS endpoint (src/elevenlabs.ts:11-18,64-66).
- Private compute/API bearer token created exclusively at \<checkout\>/.runtime/token with mode 0600 (src/cli.ts:13-23).
- Durable candidates, WAVs, human feedback and selections under \<workflow-root\>/.runtime/studio; disposable generation under \<workflow-root\>/out; backend work/model binaries remain under the installed factory checkout (workflow.mjs:179-210; src/backend.ts:17,82-84).
- Provider paid request receipts/original MP3 under \<workflow-root\>/.runtime/elevenlabs/\<32-hex-run-id\>, mode 0700 directories/0600 files (src/elevenlabs.ts:21-25,43-44).

### Trust Boundaries

- Foreign websites to loopback Studio: exact Host, Origin and Sec-Fetch-Site, custom bootstrap header, HttpOnly SameSite=Strict session and mutation CSRF gate; bind 127.0.0.1 (studio.mjs:26-58,152).
- Browser or non-browser client to compute service: every route requires private bearer and rejects Origin; CLI and workflow bind only 127.0.0.1 (src/service.ts:174-177; src/cli.ts:71; workflow.mjs:61).
- Prompts and feedback to DOM use textContent; IDs used in resource URLs are schema constrained; CSP rejects inline script/foreign framing (studio.js:28-32; studio.mjs:33).
- Request data to native generation/FFmpeg/Python uses bounded schemas and argv calls rather than shell interpolation (src/backend.ts:80-110; src/qa.ts:35-49,117-127).
- Artifact metadata to filesystem/export paths uses hex IDs, schema-defined source filenames, source/audio hashes, O_NOFOLLOW reads and append-only history (review-store.mjs:61-92; export-lineage.mjs:15-27; export.schema.json:14-16).
- Trusted setup downloads pinned revisions/model hashes, verifies bytes before use; startup verifies compiled binary digests and fixed Metal configuration (setup.mjs:21-41; download_models.py:10-29; src/backend.ts:26-40).
- Authenticated explicit provider operation to external billing writes an exclusive durable request marker before one POST; missing receipt cannot silently resubmit (src/elevenlabs.ts:53-65).

### Attacker Capabilities

- Realistic remote attacker can serve a malicious website visited while Studio runs, but cannot read the local token or forge browser Host/Origin headers.
- Authenticated local clients can submit prompts/feedback and request explicitly authorized generation; they already possess intended workbench authority.
- Model/provider output is data to bounded validation and media parsing, not executable instructions or destination configuration.

### Security Objectives

- Prevent foreign-origin websites from reading audio or submitting paid/generation mutations.
- Keep provider key and bearer token out of API results, URLs, logs and distributed source.
- Preserve exact audio/provenance/selection identity and avoid path escape or code injection.
- Do not automatically replay uncertain paid submissions; protect existing durable artifacts during restarts.

### Assumptions

- User context specifies a locally running project; single-user trusted checkout and local service environment assumed, with no hostile process already controlling that OS account.
- Studio bootstrap deliberately trusts direct loopback callers; this is not OS-user authentication for a shared multi-user machine (studio.mjs:41-52).
- Downloaded upstream/runtime/dependency implementation is not vendored first-party source; pinned integrity verification reviewed, external CVE feeds and native binaries not dynamically audited.
- An independent baseline auditor reviewed production code; architecture mapping and focused follow-up were performed by the coordinator because concurrent agent slots were occupied.
- No supplied SECURITY.md guidance resolved at repository root, src, or scripts. No application/network execution was performed by security reviewers; runtime verification elsewhere in project review remains separate.

## Findings

### No findings

No reportable findings survived the canonical discovery, validation, and reportability gates.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Local HTTP identity, browser origin and DOM rendering | not recorded | No issue found | Studio exact Host/Origin/Sec-Fetch-Site, bootstrap custom header, strict session/CSRF and CSP inspected; compute bearer gate and Origin refusal universal. Dynamic UI uses textContent. Source: studio.mjs:26-58,152; src/service.ts:174-177; studio.js:28-32. Existing security tests independently inspected (studio.test.mjs, service.test.mjs). |
| Artifact paths, lineage, human feedback and exports | not recorded | No issue found | Constrained identifiers/source filenames, schema/hash verification, NOFOLLOW final-file reads, append-only conflict checks; no caller-selected arbitrary HTTP filesystem root. Sources: review-store.mjs; export-lineage.mjs; retain.mjs; bundle.mjs; export.schema.json; run.schema.json; qa-report.schema.json. Local filesystem edits by same account are not a new attacker boundary. |
| Generation, prompt parsing, QA and setup process execution | not recorded | No issue found | Reviewed all src/\*.ts, workflow.mjs, batches.mjs, prompt-plan.mjs, qa.py, setup.mjs, download_models.py and run. User/model text remains bounded data; subprocesses use argv; pinned model/binary checks and process identity checks present. Backend work paths use installed factory root even when workflow root is isolated; this is correctness/concurrency behavior, not established hostile authority gain. |
| Paid provider key and uncertain submission recovery | not recorded | No issue found | ELEVEN_KEY reference only, env precedence and fixed HTTPS endpoint; 0600 exclusive submitting receipt precedes paid POST; response receipt gates restart reuse; no automatic second POST. Sources: src/elevenlabs.ts:11-25,53-65; workflow.mjs; elevenlabs.test.mjs. Empty committed env templates inspected without exposing values. |
| Developer runner, tests, fixtures, release and dependencies | not recorded | No issue found | scripts/run_codex_tasks.py executes operator-selected tasks with explicitly broad Codex privileges; no source-established untrusted remote task intake. Tests/fixture scripts independently read by test reviewer: all 12 root \*.test.mjs, qa_test.py, scripts/test_run_codex_tasks.py, scripts/studio-ui-browser-check.mjs, scripts/studio-ui-fixture.mjs; coordinator reviewed smoke.mjs, judge-smoke.mjs, sound-cases.mjs, wav-fixture.mjs, schemas, lockfiles and startup declarations. Historical plans/docs consulted as context, not executable entrypoints. No network CVE lookup or downloaded dependency/native implementation audit claimed. |
| Independent local boundary baseline | not recorded | No issue found | Independent parent reviewed product core; no confirmed vulnerabilities. Exact Host/Origin/CSRF, bearer compute API, schema and hash constrained artifact paths, argv subprocesses, exclusive paid request receipts. Remaining source audit ongoing. |
