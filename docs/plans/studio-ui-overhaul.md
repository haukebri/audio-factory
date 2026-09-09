# Audio Factory studio overhaul

Status: implemented and verified — 2026-09-09. All five phases are recorded in [the verification report](studio-ui-verification.md). The original inspection and implementation requirements follow.

## Product decision

Make the everyday journey **describe → generate → listen → compare → approve → download**. The application should feel like a listening tool, with technical operations available when needed. Replace the cream/amber palette and oversized editorial hero with a compact, cool daylight interface. Preserve the working generator, QA policy, durable jobs and immutable audio/review records.

This plan combines independent product-flow, mobile/accessibility and visual-hierarchy expert reviews with a read-only inspection of the live studio at desktop and 390×844. Current in-progress edits to `studio.html`, `studio.css`, `studio.js` and `studio-frontend.test.mjs` must be reviewed and incorporated, not overwritten.

## What the inspection established

- The initial mobile viewport contains branding, a large slogan, a long connection message and only part of the composer. Generation and listening require substantial scrolling.
- The page simultaneously presents prompt settings, budgets, setup, listening, comparison, cuts, review, operational history, candidate records and evaluation tools.
- The library and comparison selector expose immutable candidate snapshots as independent takes. During inspection, twelve entries represented three generation runs. Cut-save copy also calls a cut a new take.
- Selected audio shows prepared and original players together, followed by scores, revisions, hashes and policy detail before ordinary review actions.
- Rejection reasons and trim inputs are permanently expanded. Cancellation is in request history, separate from progress.
- Selecting/rebuilding candidate content recreates audio and form elements. The overhaul must preserve playback, focus and draft input across background updates.

## Navigation and terminology

Two primary destinations: **Create** and **Library**. **Settings** and **Evaluation tools** are secondary menu destinations. Comparison and trimming are contextual views, not primary navigation items.

| Term | Meaning and identity |
| --- | --- |
| Sound | A group of explicitly related requests/takes; its prompt is a description, not its database identity |
| Take | One actual generation, identified by `evidence.generation.id` |
| Version | Original, prepared clip or saved trim of that take |
| Automated checks | QA assessment, separate from the user's approval |
| Details | Seeds, model/settings, provenance, logs and raw evidence |

Group candidate records by generation ID before rendering. Deduplicate evaluation-only snapshots in the presentation by exact asset and cut identity; never delete their records or infer chronology from hash ordering. Keep the exact candidate ID behind every review, trim and export action. Do not merge distinct generation runs even if their audio hashes happen to match; optionally label them “Same audio as Take 1.”

Use existing job/continuation lineage for sound grouping. If a fresh request created by “Generate another take” cannot express that link, add only durable group membership metadata to jobs/the studio index. Validate references and preserve idempotency; no new project-management system. Existing unlinked jobs remain separate sounds rather than being merged by matching prompt text.

Within a sound, order takes by persisted generation start time with an ID tie-breaker. Give them stable visible names such as Take 1 and Take 2. Select the exact current workflow result when available. For historical records lacking an authoritative preferred version, display an explicit version choice; do not pretend a candidate hash identifies the latest edit. Remember the user's version selection across navigation. Approval remains attached to the exact reviewed candidate; it must never silently carry to a different trim or evidence record.

## Everyday flow

### 1. Describe

Create starts with a compact header, a plain title (“Create a sound”), a prompt field, duration and **Generate sound**. The primary action is visible in the initial 390×844 viewport with default content. At smaller sizes it stays easy to reach without hiding the keyboard or focused input.

**More options** reveals constraints, intended event count, an explicit seed override and automatic retries. Random seed is the default; show “New variation each time.” Reveal attempt/time budgets only when automatic retries are enabled. Keep manual generation the initial default. Retain existing valid ranges and backend defaults.

Show a compact ready indicator only when useful. If setup is required, put the explanation and preparation action beside Generate. During setup show real stage/progress and cancellation; do not expose permanent duplicate setup buttons or invent completion percentages. Keep full model management in Settings.

### 2. Generate

Submission opens the active sound's progress area: requested sound, current stage, elapsed time, attempt count when relevant and **Cancel generation** together. Stages use plain language: Preparing models, Generating audio, Preparing clip, Checking audio. Keep previously completed takes playable.

After submission acknowledgment clear the pending-submit key. Double-clicks, network retries and refresh reattach to the existing request. A deliberate new-take action creates a new request identity and a fresh seed, persisted before generation. Explicit seeded reproduction remains an advanced option.

On completion select the resulting take and show **Play take** without autoplay. If the user has navigated elsewhere, offer “New take ready · Open” without moving their view or focus.

### 3. Listen and make another take

The listening view contains the sound title, take/version identity, one player, duration, human review status and contextual actions. Show the prepared clip when an authoritative prepared result is available. Original audio and trims are choices within the same take, not simultaneous default players.

**Generate another take** preserves the intent/settings and starts a fresh variation; prompt edits are unnecessary. If the previous budget is exhausted, state the new request's bounded budget before submission. Keep this distinct from reconnecting or recovering unfinished work.

**Approve** records existing human acceptance. **Reject** opens a short reason picker and optional note, then saves the rejection; rejecting alone does not silently generate more audio. Do not add a competing favorite/winner status. Explain the exact version being reviewed, and keep corrections available.

### 4. Compare

Every take offers **Compare**. Choose a second distinct generation, preferring the same sound; broader Library selection is secondary. Display two named choices, A and B, with their take/version names. Desktop uses side-by-side cards; mobile uses compact stacked cards. Starting one pauses the other. Retain native playback/seek controls initially.

Comparison excludes duplicate snapshots by default. Comparing two versions of one take is an explicit “Compare versions” action. Blind review is a contextual comparison/review option and hides automated assessments without rebuilding players or erasing notes. Approving one candidate does not reject the other.

### 5. Trim and download

**Trim** opens a focused editor with native playback and labelled numeric start/end controls. Saving says **Save version**, keeps the take count unchanged and shows the saved version as unreviewed where required. Original and previously reviewed versions remain accessible. Identical saved audio must not look like a new generation. No waveform dependency or drag-only editor is required.

**Download** offers the existing verified audio-and-details bundle with a plain description of its contents. A direct WAV option may be added using the validated selected-asset route, with an explicit filename and without claiming it includes provenance. Keep the full bundle readily available. Downloading never implies human approval. Source-only/error states explain whether preparation is needed instead of showing a dead export action.

## Information placement

| Information | Default location |
| --- | --- |
| Prompt, duration, Generate | Create |
| Active stage and cancellation | Current sound, plus a compact link when elsewhere |
| Takes, player, approval, compare, download | Listening view |
| Original/prepared/trim selection | Version control inside a take |
| One-sentence automated result | Collapsed “Automated checks” summary, distinct from human status |
| Detailed scores, limitations, model/seed/hash, logs | Expandable Details |
| Constraints, fixed seed, retries/budgets | More options |
| Model setup/readiness and diagnostics | Settings; contextual intervention if generation is unavailable |
| Search and human-status filters | Library |
| Blind review queue, coverage counts, dataset export | Evaluation tools |

Keep actionable errors visible at the affected control. Do not collapse an operational failure into a reassuring QA badge. Show “Checks unavailable” or “Needs your review” as appropriate. Technical detail remains accessible but is not prerequisite reading.

## Responsive layout and visual system

Desktop, approximately 1024px and above: compact top navigation; a modest composer column alongside a dominant listening/results area. Library is a separate destination, not a third permanent rail. Remove the hero and numbered section headings.

Tablet: adapt to the available content width without squeezing three columns. Mobile below approximately 768px: one focused view at a time—Create, progress/listen, Library, or Compare. Use ordinary navigation/history so Back restores the previous selection, draft and scroll position. Keep at most one sticky action region; reserve its height and safe-area space. Do not combine stacked sticky player, navigation and action bars.

Proposed **cool daylight + deep teal** palette:

| Role | Color |
| --- | --- |
| Canvas | `#F4F7F8` |
| Surface | `#FFFFFF` |
| Main text | `#172A32` |
| Secondary text | `#52656F` |
| Primary action | `#006B66` with white text |
| Selected surface | `#E2F2EF` |
| Decorative separators | `#D5DFE3` |
| Control boundary | `#788B94` |
| Focus | `#2459D3` |
| Error | `#B4233A` |

These are design tokens to verify in implementation, not a claim of measured accessibility. Use green/red for labelled result states, not decorative blocks. No gradients, animated decoration or audio-reactive effects. Use restrained rounded surfaces, generous spacing around primary actions and a compact type scale. Retain locally available Avenir Next with readable fallbacks; no remote font request is needed. Set body/form text to at least 16px and use clear headings instead of widespread uppercase microcopy.

Touch targets should be at least 44×44 CSS pixels. Provide visible keyboard focus, native labels, no color-only state, reduced-motion support and text contrast of at least 4.5:1 (3:1 for large text and essential control boundaries). Validate actual rendered pairs and focus visibility. Announce stage changes politely, not every elapsed second. If an overlay is used, manage focus, Escape and focus restoration; prefer a normal view when it is simpler.

## Failure and recovery behavior

| State | User sees and can do |
| --- | --- |
| Setup required | Why preparation is needed; Prepare and cancel/progress |
| Generating | Current stage, elapsed time, Cancel; earlier takes remain available |
| Stopping | Confirmation that stopping is in progress; no premature idle state |
| Disconnected | Last known work plus Reconnect; drafts and playback selection retained |
| Completed elsewhere | New take ready link, without navigation or focus theft |
| Failed with audio | Saved take remains playable, concise failure and Details |
| Failed without audio | Error beside the generation action; explicit new attempt |
| Interrupted/unknown outcome | Recover existing work first when supported; new generation only through the existing explicit recovery contract |
| Retry budget exhausted | Preserved takes and explicit action to start a new bounded request |
| QA uncertain/unavailable | Clear human-review state; no fabricated acceptance |

## Implementation sequence

1. **Take and version identity.** Add the smallest presentation adapter over existing records; reconcile authoritative result/version selection and explicit sound grouping. Establish behavioral checks for multiple snapshots, cuts and distinct runs. This fixes the misleading comparison model before styling.
2. **Create-to-listen flow.** Replace the one-page dashboard with Create/Library and contextual views. Implement new-take semantics, progress/cancel, result selection and recovery without changing generation/QA policy. Preserve pending keys and drafts.
3. **Listening, comparison and decisions.** Add A/B selection, one-player-at-a-time behavior, version selection, contextual rejection/trim and clear download choices. Preserve exact-audio feedback/export contracts and playback during polling.
4. **Visual and mobile pass.** Apply the palette and spacing/type tokens, responsive view structure, keyboard/focus behavior and touch controls. Relocate Settings and Evaluation while preserving their capabilities.
5. **Verify and document.** Run affected frontend/studio behavior checks and build. Exercise desktop/mobile browser journeys with owned fixtures, plus one bounded live smoke only if changed integration warrants it. Document navigation and the new terminology. Preserve existing audio and all in-progress changes.

Primary implementation files: `studio.html`, `studio.css`, `studio.js`, and focused frontend tests. Touch `studio.mjs`/`workflow.mjs` only for a demonstrated metadata or route need. Preserve the plain HTML/CSS/JavaScript stack; no framework, player library, backend abstraction or data migration is required merely to redesign the UI.

Implementation verification uses an isolated fixture store and owned browser/session/port; see the verification report for reproducible commands. Do not run generation or submit feedback against the user's library for UI testing. Verify completed existing jobs before any real smoke; preserve their artifacts and never stop an unrelated service.

## Acceptance scenarios

- Same prompt, two deliberate generations: two distinct run IDs/seeds and two clearly numbered takes. Duplicate submission/reconnect produces one take.
- One generation with original, preparation, analysis and QA snapshots: one take. Saving a different trim creates a version, not another take.
- Two actual generations with identical audio still remain distinct runs, with an explanatory duplicate-audio label if implemented.
- A new user completes prompt → generate → play → another take → A/B compare → approve → download without seeing hashes, datasets or QA configuration.
- Download and feedback always target the visible exact version. Changing a cut never inherits another version's approval silently.
- Playback position, focus, entered notes and trim drafts survive background polling and toggling automated details. Switching A/B never plays both at once.
- Refresh during submission/generation reconnects without another generation; cancellation and interrupted recovery remain explicit and preserve audio.
- At 320, 375, 390, 768 and 1280 CSS px: no horizontal page scrolling, hidden essential actions or ambiguous A/B labels. At 390×844, default Create exposes Generate without the existing long dashboard scroll.
- Verify keyboard-only flow, labelled playback/seek, 200% text sizing, 400% zoom, reduced motion and measured contrast. Sticky elements must not cover focus or the on-screen keyboard interaction area.
- Exercise empty, long-prompt, many-take, setup, delayed generation, failed, stopped, disconnected, exhausted and source-only states.
- Revisit a saved sound after reload: take/version selection and durable human decisions remain understandable. Evaluation tools still export the existing dataset and preserve blind review.

## Scope boundary and remaining decisions

Mobile-friendly means responsive and touch-usable. The current server is loopback-only with exact Host/Origin protections; opening it on a physical phone requires a separately designed authenticated access path. This plan does not weaken those protections or claim phone connectivity.

No owner decision blocks beginning implementation of this plan: default to the light teal direction, manual generation, native players and Create/Library navigation. Validate those choices with the first complete working flow. A dark theme, waveform editor, batch-generation composer, new preference/winner system and broader model changes are outside this overhaul.
