# 03 — Build the prompt and listening workspace

Status: [x] Complete

Overview: [M2 queue](00-overview.md) · [Project](../../project-overview.md)
Milestone: [M2 — Review studio and automatic quality control](../../milestone/05-review-and-quality.md)
Depends on: [02 — Expose the local studio and shared job workflow](02-studio-service.md).
Expected duration: 60–120 minutes.

## Outcome and scope

Use the frontend-design skill to implement the milestone's local Review studio against task 02's real endpoints. Start with plain HTML/CSS/JavaScript, native audio and accessible forms; add dependencies only for an evidenced requirement. Include prompt/constraints and budget inputs, readiness/progress/cancel, persistent request/candidate history, original/prepared playback, comparison, cut adjustment, approve/reject with reason tags/note, blind-review mode, retry and verified export.

Show human and automatic verdicts separately. Until a judge is connected, state that automatic evaluation is unavailable; do not fabricate scores. Show setup/missing-model/error/interrupted/exhausted/empty states with a concrete next action. Feedback success appears only after persistence. Preserve prompt edits across refresh. Users can finish the normal flow without opening JSON files. All controls are keyboard usable, labelled and visibly focused; status is not conveyed by color alone.

## Required checks and review demo

- Run a real browser journey against controlled fixture generation: enter a prompt, play candidates, adjust a cut, reject with a reason, approve another and export its complete bundle.
- Refresh and restart the studio; confirm history/feedback and pending-job attachment remain correct.
- Exercise keyboard navigation, narrow viewport, missing judge, rejected operation and cancelled job states; inspect screenshots and fix layout issues.
- Test malicious-looking prompt/model text as inert text. Verify downloaded export hashes and browser playback resource responses. Browser playback is UI evidence, not an agent listening claim.

## Preflight and recovery

Preflight browser automation and local session access before implementation. The browser can use synthetic candidates for its technical journey. Reuse available tooling; no hosted deployment, public visibility change or cloud service. Actual owner listening can now collect real labels independently while later tasks run; do not block engineering tasks waiting for a label quota.

Follow the shared execution, evidence and completion agreement in [00-overview.md](00-overview.md). Implement only this task and its integration needs, update this status/overview plus directly supported milestone items, and leave later tasks to the queue. The runner owns review and commits; do not change the runner or commit from the implementation session.

## Evidence

Implemented and verified on 2026-09-09 against clean input revision `325c83655fb706c13711858aa48e941b1b18ea60`. Read the complete task, M2 queue, project overview, milestone, task 02 evidence and the studio/workflow/store/QA/cut/bundle/CLI/setup paths. No repository or ancestor AGENTS.md exists; supplied owner working agreements apply. Used frontend-design, ponytail, agent-browser and systematic-debugging. No commit, runner change, dependency addition, hosted service or model download.

Implementation: plain `studio.html`, `studio.css`, `studio.js` provide the warm neutral listening workspace, labelled native controls, visible keyboard focus, prompt/constraints/event-count/duration composer, persisted draft inputs, manual attempt/time budgets, readiness, durable progress/cancel/retry/recovery, candidate history, original/prepared/comparison playback, separate cut identities, explicit human reasons/notes, blind review and complete verified download. Text is inserted with `textContent`. Automatic evaluation is explicitly unavailable; the UI uses signal-only QA and disables automatic retries. Feedback success follows persistence. Server integration adds readiness, isolated cuts through existing `qaOperation`, budgeted explicit retries, and acknowledgement of uncertain interrupted outcomes without generation. Existing CLI behavior without a budget is preserved. Budgets start after setup and include manual listening time; accepted QA drains safely. No later judge/automatic policy work was implemented.

Preflight: `agent-browser --session m02-frontend open about:blank` succeeded before implementation; Node v22.22.3, existing dependencies, FFmpeg/signal environment and 674 GiB free were available. Used fresh owned fixture roots and ephemeral loopback ports. Backend, QA and configuration hashes match task 02, so unchanged real-model evidence is inherited.

Executed checks:

1. `pnpm build` passed. `pnpm test:audio-factory > .test-artifacts/m02-frontend-all-tests.log 2>&1` passed **13 Node checks and 2 Python checks** on the final product code. This includes isolated frozen install/build/bootstrap, legacy authentication/ownership, store relocation, source retention, service cancellation/recovery and bundle verification. After adding the final deadline assertion, `node --test studio.test.mjs studio-frontend.test.mjs > .test-artifacts/m02-frontend-final-focused.log 2>&1` passed all **4 focused checks**. The added checks exercise invalid budgets, new cuts with exact bounds and separate feedback, retry attachment and exhaustion across restart, resume budget enforcement, acknowledged interruption, and an actual generation deadline that stops its owned child. Final smoke root `.runtime/studio-test-Nz8UQ8` and children 46899/46955/46976/47026, setup child 47087, were verified removed by the test.
2. `node studio.test.mjs --browser-fixture > .test-artifacts/m02-frontend-browser.log 2>&1` created `.runtime/studio-browser-JEwXo3`, URL `http://127.0.0.1:62107`, initially PID 41000. Generation is a synthetic WAV-producing subprocess; signal analysis, FFmpeg cutting, persistence and exports are real. Fixture candidate records carry `fixture: true`, so synthetic approvals/rejections do not become quality-evaluation labels. A synthetic automatic record exists only to exercise malicious-looking model text, explicitly labelled as such.
3. Actual Chrome journey with `agent-browser --session m02-frontend`: `open`, `snapshot -i`, `fill`, `click`, `reload`, native audio controls, `select`/browser DOM change for comparison, and `eval --stdin`. Entered `A single wooden knock <img src=x onerror="window.promptInjected=true">`, constraints `No voices or background music`, event count 1, duration 1 second, budget 2 attempts/20 minutes. Refresh while request `e851e37b3a83f403a24cbedd93c475fb` was running attached to the same job and retained draft inputs. Original and prepared playback reached `ended: true`, duration 1 second. Invalid cut 0.8–0.2 seconds was rejected visibly; cut 0.1–0.6 seconds created `9a96e13c6986cce6369843fbeb10fbe265476a5d40d69a45da84bccc1c446304` with 0.5-second playback. Rejected this cut with `bad_trim` and note `Synthetic browser rejection; no human listening claim`; approved original prepared candidate `235585fee0a52e4fe172d59abedd9ab093cc134eea9f4019bdddbef9ad759828` and clicked Export verified bundle.
4. Verified both browser-downloaded TARs by extracting to `.test-artifacts/m02-frontend-export-verify`, reading their actual metadata/audio/source and running `verifyExport`; temporary extraction removed. The final approved download is `.test-artifacts/m02-frontend-export (1).tar`, includes feedback event `bb0b99ddf5514888bf9e3f606cf17b31` and the full bundle. The earlier download without feedback also verified and remains as `.test-artifacts/m02-frontend-export.tar`. Moved only these task-created downloads out of Downloads. Browser resource checks for prepared/original/comparison returned HTTP 206, `audio/wav`, and 44 bytes for `Range: bytes=0-43`. Playback is UI evidence, not an agent listening claim.
5. Browser process/service restarts reused the same root/port with `node studio.test.mjs --browser-fixture /Users/haukebrinkmann/Projects/audio-factory/.runtime/studio-browser-JEwXo3 62107`; feedback and candidates survived, and generation was not replayed. Explicit retry produced attempt 2, then showed budget exhausted. In the final named session `m02-frontend-final`, UI cancellation of `7767432f8e3709ed5683f03ea80b3c93` persisted `canceled` and stopped the owned child. Refreshed pending request `38ceee1e157ea06bce6d08922b51fe46`, then deliberately terminated verified owned parent PID 42435 and synthetic child 44495. Restart recorded `interrupted`, with no duplicate generation. Exercised the UI acknowledgement action and confirmed both saved labels and draft text after another graceful restart. Final browser fixture PID 47225 exited on SIGTERM and removed its root.
6. Malicious-looking prompt/model text remained visible inert text: zero inserted images, no `promptInjected`/`modelInjected` execution, and `document.cookie` empty. Blind review hid automatic evidence, persisted across refresh, and was keyboard toggled with the skip link, Enter, Tab and Space; focused control had a solid visible outline. Inspected desktop and 375×812 screenshots; narrow document scroll width equalled 375. Artifacts: `.test-artifacts/m02-frontend-desktop.png`, `m02-frontend-narrow.png`, `m02-frontend-narrow-top.png`, `m02-frontend-recovery.png`, `m02-frontend-empty.png`, `m02-frontend-setup-error.png`.
7. `node .test-artifacts/m02-frontend-states.mjs` served a separate owned empty store with real missing-model readiness and a controlled setup failure, without invoking setup or generating audio. Browser checked empty history/library, setup-required next action, failed setup and retry/no-playable-take states. Roots `.runtime/studio-frontend-states-0kGZBi` and `.runtime/studio-frontend-states-I5m1gb`, processes 44778 and 45260, were stopped and removed. The isolated fixture script/log/manifest stay ignored as technical evidence.
8. `git diff --check` passed. Final process/root/port checks confirmed all owned fixture roots removed, no fixture/model process left, and no listeners on 62107/62460/62510/8766/8767. The final named browser session closed normally. Existing runtime, caches and unrelated downloads were preserved.

Issues found and resolved: background polling originally shared a busy flag that dropped user clicks. A browser reproduction returned `secondActionRan: false`; actions now serialize and the regression/browser reproduction passes. An initial automation wait missed a short-lived cancel state and stalled; only the owned browser session was reset and the cancellation journey repeated successfully with a 15-second synthetic delay. The restart fixture originally assumed its first sorted job was completed; it now identifies its seed job explicitly and restarting a pending job succeeds. Empty-library rendering was initialized explicitly after the empty-state check. These failures were not counted as passing checks.

Final SHA-256:

| Input/artifact | SHA-256 |
| --- | --- |
| `studio.mjs` | `f70411553592ed6d0dc53764ee2fe82636a572c1ec60fe76f763fc8ecf963011` |
| `studio.js` | `d3c75c0250890d1c2a1795285982e3fdf5cfd255ebc0574114a67c93deb57a15` |
| `studio.html` | `d183c2e19d17a22ec6de8efacf4b3e82d54831a8e871ae6543189a00ae0bab2c` |
| `studio.css` | `77fb0277e498a05aeb49c4f39455489ba3cf2dc0cdf676245065ae1f67d72bf9` |
| `workflow.mjs` | `94cd7348a3611e45934bcc828a178827acd02a03e9a8c36e15474433cdade21b` |
| `studio.test.mjs` | `9a9dd8e07e22b67a902657deca460d132aac0a60561c7aebc2bd034b195cb1cb` |
| `studio-frontend.test.mjs` | `20f59e055424a3f8c789fcae3167a97ed7c20412ac08895b42b5de3fd2f165f9` |
| Synthetic source WAV | `f5af57e6de9a850a1a8e46feace23bed6dcb67e4255931e9124298a1a220a719` |
| Approved prepared WAV | `e66711a8511a0a6b332cb4e7915914f1b19498125ec5154ba724729b7ac39048` |
| Approved browser TAR | `c6a4275d6e5806b4599912491bfe4927fb27cce334f4bebbbb136df1fff7ae70` |
| Desktop screenshot | `d520b8384ce2724d628f599f1bb01d3c6d00e3efa9c85a79b4fe24f267d9ca0d` |
| Narrow listening screenshot | `1f71b6acd27b2ae4edb8ba5aee81f294ba8fe41b2119f7f95cb0269b3c26060d` |

No mandatory check remains unrun. Real MLX/CLAP inference, `pnpm audio:smoke`, human listening and real judge evaluation were not run: this task calls for controlled fixture generation, and judge integration remains task 04. No acoustic quality claim or owner acceptance gate applies. No recovery action remains outstanding.
