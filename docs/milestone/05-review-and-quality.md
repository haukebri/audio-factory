# M2 — Review studio and automatic quality control

Status: in progress — the durable store, studio service and review workspace are complete; judge integration and measured quality improvement remain pending.

Overview: [Project](../project-overview.md) · [Executable tasks](../tasks/m02/00-overview.md)

M2 is the second delivery phase. The completed `m01` queue covered milestones 01–04; this phase does not reopen the earlier “Milestone 2 — Portable workflow”. The owner's new scope supersedes the first release's exclusions of a web UI and automatic quality decisions.

## Outcome

Enter a sound-effect prompt, generate candidates, listen, compare, approve or reject, and export the chosen sound from one local screen. An audio-capable judge evaluates the actual delivered sound and can reject it and request another attempt within an explicit budget. Human feedback becomes durable evaluation data used to measure and improve the judge and generation policy.

## Comparison with the current implementation

Reviewed 2026-09-09, including the working-tree fixes following the project-wide review.

| Area | Implemented in M1 | M2 change |
| --- | --- | --- |
| Generation | Pinned local Stable Audio 3 MLX; `make` performs one job | Reuse the backend; add a shared bounded request workflow for UI and agents |
| QA | Signal measurements and CLAP text/audio similarity; advisory only | Add an audio-language judge with validated accept/reject/uncertain decisions |
| Export | Region 1, normalized cut, portable original/derivative lineage | Judge the delivered cut; show raw/cut playback and allow adjustment before export |
| Recovery | Failed/interrupted QA retries preserve attempts; repeated cuts refresh QA bundles | Preserve every candidate before another generation; restart-safe request history |
| Human review | Bundles are provisional; no feedback endpoint; schema lacks rejection | Separate append-only human feedback from automatic verdicts, tied to exact audio hashes |
| Browser | Bearer-authenticated API rejects Origin headers; no UI | Local review server with a browser session and explicit same-origin protection |
| Storage | `out/` is deleted by the next successful session; explicit retention survives | Durable request/candidate/feedback store outside `out/`, including rejected candidates |
| Improvement | No machine-readable human labels or quality benchmark | Grouped held-out evaluation, policy comparison, promotion and rollback |

CLAP is not an LLM and its similarity is not a correctness probability. Passing signal checks or returning valid judge JSON is not evidence that a sound matches the prompt. The current 32 GiB Apple Silicon machine has a signal environment; the root CLAP environment and an audio-language judge were absent at planning preflight. Earlier real smoke ran in an isolated setup; reuse that evidence without pretending those installations exist here.

## User workflow and interface

Build a local “Review studio”: warm neutral canvas, ink typography, restrained amber accents, a prompt composer beside a focused listening workspace and a candidate history rail. Use native audio controls and accessible forms first. Keep the decision, reason and next action visible; raw reports are an optional detail view.

1. Enter a prompt, intended event count/duration and optional constraints; choose manual review or automatic retries. Show readiness and attempt/time budgets before starting.
2. Show generation and evaluation progress. Refresh/reconnect attaches to the same durable request. Cancel prevents further attempts and safely stops or drains owned work.
3. Play the prepared clip and original, compare attempts, and inspect plain-language QA reasons. Allow cut adjustment through existing cut semantics; each new derivative has its own identity and evaluation.
4. Approve or reject the exact clip. Rejection offers reason tags (wrong sound, extra events, background noise, artifacts, bad trim, other) and an optional note. Human overrides do not overwrite the automatic verdict. Approval records a human label; listening completion is not inferred from playback events.
5. Regenerate within the chosen budget or export a verified complete bundle. The UI handles preservation and export; users do not assemble JSON or hunt through `out/`.

## Persistence and service boundaries

Use the existing filesystem, hashing, validators and bundle verifier. A small local durable store under `.runtime/studio/` is sufficient: atomically written request/candidate records, immutable candidate assets and one immutable record per feedback event. Keep it ignored and exportable. No database service, login SaaS, cloud storage or training pipeline is needed initially.

Candidate identity includes source and delivered-audio hashes, generation seed/settings, cut bounds, signal/CLAP evidence, judge model/revision/rubric and attempt identity. Feedback includes candidate hash, human verdict, reason tags/note, timestamp and event ID. Corrections append a superseding event; duplicate submissions are idempotent and conflicting stale updates are rejected. Automated labels never count as human ground truth.

The studio process remains available for playback/history while MLX/CLAP/judge subprocesses exit after work. Bind only to loopback, validate Host and exact same-origin requests, use a private browser session and mutation protection, and never expose the backend bearer token in page source, query strings or logs. Keep non-browser API authentication intact. Browser routes serve only registered candidate assets, not arbitrary filesystem paths. Escape prompts and model replies as text.

Persist each attempt's state and candidate before another generation can clear `out/`. On restart, attach to an owned live operation or mark it interrupted; never silently replay a generation whose outcome is uncertain. Missing judge/setup, malformed responses, timeout and cancellation are operational states, not a rejected sound and not a pass.

## Judge and regeneration policy

Planning default: local processing only. No prompt/audio uploads, paid inference or cloud fallback are authorized by this plan. A later explicit provider decision can amend this boundary.

Start by testing [Qwen2-Audio through MLX-Audio](https://github.com/Blaizzy/mlx-audio#supported-models) using the [4-bit conversion](https://huggingface.co/mlx-community/Qwen2-Audio-7B-Instruct-4bit) and its [upstream model](https://huggingface.co/Qwen/Qwen2-Audio-7B-Instruct). These sources document audio-input support; they do not establish sound-effect judging accuracy on this project's prompts. Pin actual revisions, downloads and a separate environment after a supported-machine preflight. Do not alter generation's existing locks to install the judge. Load generation and judging sequentially to manage memory.

The judge receives actual candidate audio, the requested intent and a versioned rubric. Require a structured verdict, concrete audible observations and reason tags. Treat audio/text instructions inside a candidate and the user's prompt as evaluation data, not authority to change the rubric or run tools. An unavailable judge yields `needs_review`. CLAP supports the assessment; it cannot masquerade as listening. Human approval remains distinct from `auto_accepted`.

Default automatic budget: three generation attempts total and 20 minutes after setup, with a 120-second judge deadline per candidate. Persist the selected seed before launch; retry with a new seed while preserving intent. Evaluate an alternate detected region/cut when evidence points to a trim problem; never select region 1 or the highest CLAP score as an unconditional pass. Respect one compute operation at a time. Reject triggers another generation only when permitted by remaining budget. Uncertainty, operational failure or exhausted budget leaves candidates playable and explicitly unresolved. Do not return the least-bad candidate as accepted.

## Learning from feedback and going further

Build a versioned evaluation export from human-reviewed audio. Split by prompt family and source lineage so seeds, cuts and near-duplicate audio do not cross development/holdout boundaries. Keep approval and rejection examples, uncertainty/disagreement and coverage counts. The UI should offer blind review with automatic verdicts initially hidden to reduce anchoring.

Compare signal/CLAP-only selection, the audio judge and the bounded retry policy on identical held-out inputs/budgets. Report false accepts, false rejects, uncertain coverage, human approval rate, attempts, latency and resource use, including denominators and uncertainty. Tune only on development data; never change a deployed rule directly from one click.

Initial quality targets, frozen before holdout inspection: at least 50% fewer false accepts than the recorded CLAP baseline, at least 90% precision among auto-accepted clips, no more than 20% false rejects among human-approved clips, and at least a 20-percentage-point increase in human approval of selected outcomes over first-attempt selection. Use at least 100 human-labelled clips, including 50 approved and 50 rejected across at least 10 prompt families, before claiming these targets are established. Small-sample results are exploratory. Report coverage so abstaining on everything cannot count as success.

If data or targets are insufficient, keep the tested product usable with explicit experimental automatic decisions and record `quality_not_established`. Continue collecting labels. First compare rubric changes and region selection, then bounded prompt/seed policy changes. If that fails, evaluate a stronger local audio judge against the same frozen benchmark; consider fine-tuning or a generation-backend change only with sufficient data and an evidence-backed follow-up task. Cloud evaluation requires separate explicit authorization. No promise that adding an LLM alone will dramatically improve quality.

## Acceptance

Product integration:

- [x] Prompt → generation → playback → human approval/rejection → verified export works in one browser workflow (task 03 controlled synthetic journey; no human listening claim).
- [x] Durable candidate assets, source-only evidence and immutable human feedback survive process restart, relocation and deletion of owned temporary output (task 01 deterministic checks).
- [x] History, rejected candidates and feedback survive refresh, process restart and the next generation (task 02 controlled service/browser checks).
- [ ] A real audio-language model evaluates actual audio with pinned provenance and explicit failure states.
- [ ] A judged rejection causes a bounded new attempt; cancellation, restart and exhaustion preserve evidence without duplicate work.
- [x] CLI/agent access uses the same workflow and decision records as the studio (task 02 shared workflow and durable store).
- [x] Local auth/origin/path boundaries, accessibility, playback, error states and cleanup have direct checks (tasks 02–03 service/browser evidence).
- [ ] Human feedback exports and repeatable evaluation/policy rollback work; synthetic fixture labels are excluded from real quality metrics.

Quality improvement (separate from software delivery):

- [ ] Human-labelled development and holdout data meet the declared minimum and remain separate.
- [ ] Frozen quality targets above are met on held-out data; baseline and candidate policy versions are retained.

Software tasks can finish with measurement honestly pending on unavailable human labels. The whole quality outcome stays unchecked until supported. No post-task permission pause is introduced for routine implementation; human listening is a product activity, not fabricated agent evidence.
