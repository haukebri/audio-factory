# Audio Factory studio

Start `./run studio` and open http://127.0.0.1:8767 on this computer. The studio keeps original audio, prepared clips, saved trims and human decisions locally.

## Create, listen, compare

1. In **Create**, describe the sound, choose its duration and select **Generate sound**. Manual listening is the default. If models need preparation, use the preparation action or let generation prepare them; progress and cancellation remain available.
2. Watch the current stage and elapsed time. You can cancel beside the progress message. Completed takes remain playable while another generation runs.
3. Select **Play take**. Nothing autoplays. The **Version** control chooses the original, prepared clip or saved trim.
4. **Generate another take** preserves the request and settings, creates a fresh seed and starts a new bounded request in the same sound. Its budget is shown before you start it. This is separate from recovering an interrupted request.
5. **Compare** presents two distinct takes as A and B. Starting either player pauses the other. Prefer the same sound, or choose the wider Library. **Compare versions** explicitly compares versions of one generation.
6. **Approve** records your decision for the exact displayed version and evidence record. **Reject** opens reasons and an optional note; saving a rejection never starts generation. Corrections preserve the earlier feedback history.
7. **Download** verifies and downloads a TAR bundle containing prepared audio, original audio, provenance and exact-version feedback. It does not imply approval. Original-only records must first be prepared with **Trim**.

**Trim** uses labelled numeric start/end times in the original recording. **Save version** applies the existing fades and normalization. It keeps the take count unchanged; a different version has its own review. Previously reviewed audio remains accessible.

## Sounds, takes and versions

A **sound** groups explicitly related requests. A **take** is one actual generation, with stable numbering based on its recorded start time. A **version** is the original, prepared clip or saved trim of that generation. Analysis and evaluation snapshots are not extra takes. Separate generations stay separate even when their audio is identical.

**Library** searches descriptions and filters human review status. Filters expose the matching exact record. Old unlinked requests remain separate sounds even if their prompts match. Where no authoritative preferred result exists, choose a version explicitly. Technical evidence snapshots remain available under **Details · exact evidence records**; approval never transfers silently between snapshots.

## Options, settings and evaluation

Each new request first prepares three sound-effect prompt variants and a separate, fixed QA sentence using one local Ollama call (`gemma4:latest`, localhost:11434). The model is unloaded after the reply. The original intent remains the sound title; Automated checks shows the actual generation prompt and QA description. Retries cycle through the three variants with new seeds. Saved plans survive restarts and explicit bounded retries. If preparation is unavailable or interrupted, the request uses the original wording and records that fallback. Preparation takes at most two minutes, before the generation budget starts.

**More options** holds constraints, intended event count, an explicit seed override and automatic retries. Random seed is the default. Manual requests have one attempt and a 20-minute generation budget after setup. Automatic retries expose attempt/time budgets; scores below the 0.30 acceptance threshold trigger retries within that budget. Inconclusive margins or unavailable QA stop for review.

**More → Settings** contains model preparation, cancellation and request diagnostics. **More → Evaluation tools** retains blind review, coverage counts and the existing dataset export. Blind review hides automated assessments without rebuilding players or erasing draft notes. Human decisions remain distinct from automated checks.

## Refresh and recovery

The browser retains composer drafts, version selection, review/trim drafts and pending submissions. An acknowledged submission clears its pending key. Refresh or a lost response reconnects using that same key; deliberately generating another take uses a new one.

When a take finishes while you are elsewhere, **New take ready · Open** lets you open it without changing your view or focus. Reconnect keeps saved work and selected audio. Interrupted work offers explicit recovery before a new generation; acknowledge an uncertain outcome only when you intend to move on. Failed, stopped and exhausted requests preserve saved audio and show the new request's budget.

The interface supports keyboard navigation, native playback/seek, reduced motion, enlarged text and narrow screens. It has no sticky action bars. The service remains loopback-only with exact Host/Origin and session protections; physical-phone network access is outside this change.
