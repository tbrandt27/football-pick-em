# Product backlog

**Status:** Planned

Feature and UX work. Carried over from the old `support_docs/TODO.md`,
which was untracked and therefore invisible to everyone but one machine.

Engineering debt lives in [`2026-09-05-code-review.md`](2026-09-05-code-review.md);
this file is for things a player or commissioner would notice.

## Features

- **Mid-season test schedule.** Seed a season as though it were mid-year so
  picks, scoring, and standings can be exercised without waiting for real
  games. This is the main thing blocking confident changes to
  `pickCalculator` and the standings views — see the code review's
  suggested-tests list, which wants exactly this fixture.
- **End-of-season winner on standings.** Surface the season winner
  explicitly rather than leaving it implicit in the sort order. Confetti
  was floated; a clear "Season champion" state matters more than the
  animation. Respect `prefers-reduced-motion` if animation is added.
- **Rules page per game type.** Weekly and survivor scoring differ, and
  nothing in the UI explains either. Worth having before inviting players
  who have not run a pool before. Note the survivor rule already enforced
  server-side: a team cannot be picked twice in a season
  (`picks.js`, `hasPickedTeamInSurvivor`).

## Known behaviour worth a decision

- **Ties are scored as losses.** `pickCalculator.calculatePicks` sets
  `winningTeamId = null` on a tie, so every pick for that game is marked
  incorrect. Most pools treat a tie as a push. Confirm which is intended,
  then encode it in a test either way.
- **Slug collisions.** "Tommy's League" and "Tommys League" both slug to
  `tommys-league`, and `getGameBySlug` resolves to whichever row comes
  back first. Either enforce uniqueness on game name, or store an explicit
  unique slug at write time (which also fixes the full-table read that
  lookup currently does).

## UX / design

The code review's design section (§5) has the detail. The items a player
would actually feel:

- Team-colour headers hardcode `text-white`, so light team primaries
  (Packers/Steelers/Vikings gold) land near 1.7:1 contrast — unreadable.
- Four `<table>` views do not degrade on a phone, which is where picks
  actually get made on a Sunday morning.
- 36 touch targets are under the 44px minimum.
- The primary pick action sits below a long scroll instead of within thumb
  reach.
