# Pause variation-card playback when leaving the listening view

Overview: [Review queue](00-overview.md)

Status: [x] Complete
Priority: P2
Area: Studio audio navigation.

## Finding and evidence

`navigate` (`studio.js:66–80`) pauses audio under `#candidate` and `#compare-view`, but excludes the primary variation-card players under `#batch-results`. Switching to Library or Settings hides a playing card while its sound continues, leaving the pause control off-screen. This is inconsistent with detailed-take playback.

Confirmed in the isolated browser: started a variation player, navigated to Library, then observed `{before: false, after: false, hidden: true}` for paused-before, paused-after, and whether the player had no layout boxes. The synthetic player was looped only to prevent its three-second duration ending during inspection; production playback has the same navigation path.

## Reproduce

Play a long variation card and immediately open Library, Settings, or Compare. The former card keeps playing invisibly.

## Minimal change

Include variation-card players in the existing navigation pause policy, ideally target the listening workspace once rather than maintaining separate player-container lists. Also check mobile Create navigation, which hides the listening desk via CSS.

## Acceptance

- Leaving a visible listening desk pauses its audio, including variation and earlier-attempt players.
- Mobile navigation to Create does not leave hidden playback running.
- Moving within the same visible listening workspace need not restart playback.
- A runnable browser check covers a primary variation player, not only `#candidate`.

## Implementation and verification

Navigation now pauses all audio under `#workspace` when that desk has no rendered layout boxes. This includes variation cards, earlier attempts and detailed takes, and follows mobile Create's existing CSS without duplicating its breakpoint. Navigation within a visible desk preserves playback.

- `pnpm build` passed.
- `node --test studio-frontend.test.mjs studio-sound-grouping.test.mjs studio.test.mjs` passed all 10 tests, including the controlled Studio smoke and its cleanup.
- `node scripts/studio-playback-browser-check.mjs` reproduced the original primary-card failure on Library navigation, then passed at 1280, 768, 767, 390, 375 and 320px after the fix and fixture restart. It checks actual playing native audio for primary cards, earlier attempts and detailed takes across Listen/Create/Library/Settings/Compare, plus comparison exit. Earlier-attempt evidence is added only to the browser's synthetic job snapshot; polling is held for that snapshot. No navigation or player behavior is mocked.
- `git diff --check` passed. Browser session closed; owned fixture processes exited and the port closed. The controlled smoke removed its root and children. Synthetic browser audio remains in `.runtime/studio-ui-ik1BGW` for reproduction.

No live model/paid smoke or unrelated legacy browser suite ran: generation integration is unchanged and the queue records obsolete scenarios separately. No owner acceptance gate is required by this task. No user audio was changed and no commit was created.
