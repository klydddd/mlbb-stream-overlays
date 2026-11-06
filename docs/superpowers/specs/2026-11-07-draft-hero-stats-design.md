# Draft hero stats (Pick / Contention rate / Win rate)

## Intent

During a broadcast draft, when a player locks in a hero, viewers should see how that hero has done
**in this tournament**: how many times it has been picked, how contested it is, and how often it
wins. The stats come from our own matches and are tracked automatically. Nobody types them in.

The controller moves between different people and machines over a tournament, so the game log
can't live in one browser. It lives in Supabase.

## Goals

- Log every finished game automatically when the operator presses **+1** on a team's score.
- Show three stats on a pick slot for a few seconds after lock-in, styled after the reference image
  (see "Look").
- Keep separate stats for each tournament, with a controller panel to create a tournament and choose
  the active one.
- Every controller and display, on any machine, sees the same data.

## Non-goals

- Ban slots get no stat pop-up. Stats appear on picks only.
- No per-player or per-team stats, and no all-time stats across tournaments.
- No importing games played before this feature existed.
- No changes to the AI bot or the in-game stats bot.

## Anti-goals (would count as failure even if it technically works)

- A broken overlay on stream when Supabase is slow or offline. In that case the pick has to render
  exactly as it does today, with no overlay, no error text and no delay to the pick animation or
  voiceline.
- Stats that count the game being drafted right now. The numbers must cover previous games only.
- Logging a game from any button other than +1.

## Definitions (all scoped to the active tournament)

- **Total games (G)**: number of logged games in the tournament.
- **Pick**: number of games the hero was picked in (by either side).
- **Contention rate**: (picks + bans) ÷ G, shown as a whole-number percent. A hero can appear at
  most once per game in MLBB, so this stays at or below 100%.
- **Win rate**: wins ÷ picks, shown as a whole-number percent. A win means the hero was on the side
  whose +1 logged the game.
- A hero with no games yet shows `0` / `0%` / `—` (win rate is undefined with 0 picks). If G = 0,
  contention is `0%`.

## Decided behavior

### Logging (controller)
- Pressing **+1** for a team (any `[data-score-team][data-score-delta="1"]` button, which covers both
  the INGAME tab and the TEAM INFO add buttons in `js/ingame.js`) inserts one game row for the
  active tournament. The row holds:
  - tournament id
  - winner side: `blue` | `red`
  - blue team name, red team name (current `blue-team-name` / `red-team-name`)
  - 5 blue picks and 5 red picks, from localStorage `heroPick-N`. Blue slots are 1, 4, 5, 8, 9 and
    red slots are 2, 3, 6, 7, 10, matching `isBlueTeam` in `js/hero.js`.
  - 10 bans, from `banPick-1..10`
  - created_at timestamp
- **Completeness guard (user decision):** +1 logs a game only if all 10 `heroPick-N` slots are
  filled. If any are missing (the draft was reset or the next draft started, or +1 was used just
  to restore a series score), the score still updates, nothing is logged, and the controller shows
  a visible "not recorded: draft incomplete" warning.
- Empty ban slots don't block logging. A game is stored with blanks for missing bans and still
  counts toward G. (Claude's call.)
- Pressing **−1** undoes a mis-click by deleting the most recently logged game in the active
  tournament, but **only if** that game's winner is the team being decremented **and** the score
  actually went down (it wasn't already 0). Otherwise −1 is a plain score fix and deletes
  nothing. (Claude's call; the user agreed to −1 as undo.)
- The AI draft bot is not used on live broadcasts (user). Bot-filled drafts never reach the
  controller's localStorage, so the guard skips them. No AI-path changes are needed.
- SWITCH TEAMS also calls `setScore` (swapping the two scores). That must **not** log or delete
  anything. Only a direct +1/−1 button click does.
- If no tournament is active, +1 still updates the score as it does today, logs nothing, and the
  controller shows a visible warning that the game wasn't recorded.
- If the insert fails (offline, for example), the score still updates and the controller shows a
  visible "game not saved" warning. No retry queue is required.

### Tournaments (controller)
- A new controller panel, TOURNAMENT STATS, visible in SETUP mode. It can:
  - create a tournament (name only)
  - choose the active tournament from a dropdown
  - show the active tournament's game count, so the operator can confirm logging works
- The active tournament is stored in Supabase (a single settings row), so whoever opens the
  controller next, on any machine, lands on the same tournament. (Decision by Claude, user agreed.)

### Display (`display.html`)
- **Trigger:** a real lock-in, meaning the path that calls `updateHeroPick` with sound (not
  `updateHeroPickSilent`). That covers the storage-event path, the WebSocket `heroPick` path and the
  AI-prediction pick path. Silent re-renders (page load restore, `switch`, the final phase 18) do
  **not** show the overlay.
- **Look** (from the user's reference image): the hero art in that slot gets a gold/sepia tint, and
  three stacked, centered, heavy white label/number pairs sit on top: `PICK` / big number,
  `CONTENTION RATE` / big %, `WIN RATE` / big %. The labels are small and uppercase, the numbers
  large and bold, with a soft text shadow. The existing horizontal hero-name bar stays as it is.
  Don't adopt the reference's vertical side bar.
- **Timing:** it fades in on lock-in, holds for about 4 seconds, then fades back to the normal art.
  (The 4 s figure is Claude's call, which the user agreed to.)
- **Data freshness:** the display loads per-hero aggregates for the active tournament on page load
  and again whenever it hears a game was logged or deleted. Then the overlay at lock-in time is
  instant and needs no network call. A new message `{type: "tournament-stats-changed"}` goes out
  over BroadcastChannel and WebSocket after every log, delete or active-tournament change. The
  display also re-fetches on a slow interval, so it recovers if it missed a message.
- If the stats haven't loaded (offline, or no active tournament), the overlay just doesn't show.

### Supabase
- Use the user's connected Supabase account (a new or existing project, whichever the user picks
  at build time).
- Tables: `tournaments`, `games`, and a one-row `settings` (active tournament id). Picks and bans
  can be stored as text arrays or columns; that's the builder's call.
- Use the publishable/anon key in the frontend, loaded with `@supabase/supabase-js` from a CDN
  (there's no build step). RLS: anon can select on all three tables, insert on `games` and
  `tournaments`, delete on `games`, and update `settings`. The user accepts that anyone who
  reads the page source could write junk rows.
- Hero names are stored exactly as the `name` values in `js/hero.js`. Matching is
  case-insensitive (the existing code lowercases).

## Constraints

- Vanilla HTML/CSS/JS, ES modules, no bundler (see CLAUDE.md).
- `display.html` runs inside OBS, so the overlay must not shift layout or interfere with the
  existing `blue-select`/`red-select` lock-in animations and voicelines.
- The controller code in `ingame.js` is an ES module and can import `send`.

## Left to the builder

- Exact schema shape, whether aggregation happens in SQL (a view or RPC) or client-side, and the
  name and location of the new JS/CSS files.
- Exact fade curves and typography sizes, within the look described above.
- Where the Supabase URL/key constants live (one shared config module is preferred).

## Testing

There's no test suite. Verify by hand: open controller + display with the same `?room=`, create a
tournament, enter picks/bans, press +1, check the row in Supabase, start a new draft, lock in a
hero you've logged, and see the right numbers show and then fade. Press −1 and check that the game
is removed. Kill the network and check that picks still render normally.
