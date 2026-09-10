# Independent project model

Saved before opening test sources or running baseline, 2026-09-10. Revision c5ad0b28871a7a9c0b55433f2b0b334bb7a66bef; initial worktree clean. Scope: entire application and task-runner tests, including standalone browser/smoke entry points. Review only; sources and tests unchanged.

Audio Factory is a local Apple Silicon sound-generation and human-review tool. Human actors create/review/select sounds; agents submit durable batches and collect exact winners. Studio browser and bearer APIs share persisted jobs, five local prompt variations, signal-only retry decisions, and optional explicitly paid single recreations. README and docs/agent-api.md supersede historical milestone contracts.

| ID | Behavior and production anchors | Scope / impact | Contract / confidence |
|---|---|---|---|
| B1 | CLI/setup → verify pinned tools/model files → launch owned compute → dispose temporary runs only after readiness/port ownership; src/cli.ts, src/setup.ts, setup.mjs, src/backend.ts | core / high | installation, lifecycle; high |
| B2 | Input → strict request schemas, bearer/Origin/Host/session/CSRF gates → accepted single operation; src/service.ts:createFactory, studio.mjs:createStudio | core / critical | local trust boundary; high |
| B3 | Durable key → signature conflict/reuse → persist accepted job and attempt → five distinct prompts, three signal retries maximum; workflow.mjs:openJobs, prompt-plan.mjs | core / high | idempotency, compute cost; high |
| B4 | Abort/restart → ownership verification, uncertain operations stop, completed evidence reused → no silent replay; workflow.mjs:runWorkflow/openJobs, src/ownership.ts | core / critical | recovery, data integrity; high |
| B5 | Explicit recreation → provider request receipt before POST → original bytes/hash → decoded WAV, no uncertain paid retry; src/elevenlabs.ts | core / critical | money, idempotency; high |
| B6 | WAV → signal analysis → first active region/fades/normalization → validated lineage bundle; qa.py, src/qa.ts, bundle.mjs, export-lineage.mjs | core / high | audio correctness, provenance; high |
| B7 | Candidate bytes/evidence → immutable hash storage → append-only feedback and exact-version selections → exports survive session/relocation; review-store.mjs, retain.mjs | core / critical | durable human decisions/data integrity; high |
| B8 | Batch request → sequential queued sounds → pause/revise/recreate → exact all-selected winner manifest; batches.mjs | core / high | persistent agent workflow; high |
| B9 | Browser create/play/trim/compare/select → authenticated routes and refreshed persisted state; studio.js/studio.html/studio.css | core / high | human review and accessibility; high |
| B10 | Task markdown → isolated agent implementation/review → validated result → commit/recovery state or explicit owner pause; scripts/run_codex_tasks.py | supporting / high | developer automation, commits; high |
| B11 | Historical evidence remains readable while removed semantic tools reject new calls; workflow.mjs, qa.schema.json, review-store.mjs | supporting / normal | migration/compatibility; high |

Inputs cross JSON/schema, HTTP, model-output, filesystem/hash, and subprocess boundaries. Durable .runtime/studio and paid receipts must outlive disposable out; model/cache setup and real generation are expensive external effects. No real generation, external provider request, model download, dependency installation, or real task-runner agent invocation is authorized for this test baseline. Synthetic Node suite, existing signal Python environment, temporary-repository runner tests and build are safe after test-source preflight. Mandatory evidence: full source/test inspection, mappings and safe baseline. Best effort: mutation/timing history, per-test coverage and real browser visual acceptance; do not infer them from synthetic checks.
