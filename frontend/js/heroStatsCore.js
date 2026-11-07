// Pure logic for the draft hero stats (no DOM, no network), shared by the controller and the display.
// Tested by tests/heroStatsCore.test.mjs (run: node --test tests/heroStatsCore.test.mjs).

// Draft slot numbers per side, matching isBlueTeam in js/hero.js
export const BLUE_PICK_SLOTS = [1, 4, 5, 8, 9];
export const RED_PICK_SLOTS = [2, 3, 6, 7, 10];

const clean = (v) => (typeof v === "string" ? v.trim() : "");

// Build a game row from the controller's localStorage-shaped getter.
// Returns { ok: true, record } or { ok: false, reason: "incomplete" }.
// Logging needs all 10 picks; empty ban slots are dropped.
export function buildGameRecord(getItem, winner) {
  const pick = (n) => clean(getItem(`heroPick-${n}`));
  const bluePicks = BLUE_PICK_SLOTS.map(pick);
  const redPicks = RED_PICK_SLOTS.map(pick);
  if ([...bluePicks, ...redPicks].some((p) => p === "")) return { ok: false, reason: "incomplete" };

  const bans = [];
  for (let n = 1; n <= 10; n++) {
    const b = clean(getItem(`banPick-${n}`));
    if (b) bans.push(b);
  }
  return {
    ok: true,
    record: {
      winner,
      blue_team: clean(getItem("blue-team-name")) || null,
      red_team: clean(getItem("red-team-name")) || null,
      blue_picks: bluePicks,
      red_picks: redPicks,
      bans,
    },
  };
}

// −1 removes the latest game only if it was won by that team and the score really dropped.
export function shouldUndo(latestGame, team, prevScore, newScore) {
  return !!latestGame && latestGame.winner === team && newScore < prevScore;
}

// games: [{ winner, blue_picks, red_picks, bans }] → { totalGames, byHero: Map(lowercase name → {picks, bans, wins}) }
export function aggregate(games) {
  const byHero = new Map();
  const entry = (name) => {
    const key = clean(name).toLowerCase();
    if (!key) return null;
    if (!byHero.has(key)) byHero.set(key, { picks: 0, bans: 0, wins: 0 });
    return byHero.get(key);
  };
  for (const g of games) {
    for (const side of ["blue", "red"]) {
      for (const name of g[`${side}_picks`] || []) {
        const e = entry(name);
        if (!e) continue;
        e.picks++;
        if (g.winner === side) e.wins++;
      }
    }
    for (const name of g.bans || []) {
      const e = entry(name);
      if (e) e.bans++;
    }
  }
  return { totalGames: games.length, byHero };
}

// The three numbers shown on the overlay, as display strings.
export function heroStatLine(agg, heroName) {
  const e = agg.byHero.get(clean(heroName).toLowerCase()) || { picks: 0, bans: 0, wins: 0 };
  const pct = (n, d) => `${Math.round((n / d) * 100)}%`;
  return {
    pick: String(e.picks),
    contention: agg.totalGames > 0 ? pct(e.picks + e.bans, agg.totalGames) : "0%",
    winRate: e.picks > 0 ? pct(e.wins, e.picks) : "—",
  };
}
