# Pause variation-card playback when leaving the listening view

Overview: [Review queue](00-overview.md)

Status: [ ] Not started
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
