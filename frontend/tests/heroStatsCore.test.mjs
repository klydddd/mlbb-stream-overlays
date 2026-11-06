import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGameRecord, shouldUndo, aggregate, heroStatLine } from "../js/heroStatsCore.js";

const store = (obj) => (k) => (k in obj ? obj[k] : null);

function fullDraft(extra = {}) {
  const o = { "blue-team-name": "ONIC", "red-team-name": "RRQ" };
  for (let n = 1; n <= 10; n++) o[`heroPick-${n}`] = `Hero${n}`;
  return { ...o, ...extra };
}

test("buildGameRecord splits picks by draft slot side", () => {
  const r = buildGameRecord(store(fullDraft({ "banPick-1": "Joy", "banPick-2": " Chou " })), "blue");
  assert.equal(r.ok, true);
  assert.deepEqual(r.record.blue_picks, ["Hero1", "Hero4", "Hero5", "Hero8", "Hero9"]);
  assert.deepEqual(r.record.red_picks, ["Hero2", "Hero3", "Hero6", "Hero7", "Hero10"]);
  assert.deepEqual(r.record.bans, ["Joy", "Chou"]);
  assert.equal(r.record.winner, "blue");
  assert.equal(r.record.blue_team, "ONIC");
});

test("buildGameRecord refuses an incomplete draft", () => {
  assert.deepEqual(buildGameRecord(store(fullDraft({ "heroPick-7": "  " })), "red"), { ok: false, reason: "incomplete" });
  assert.deepEqual(buildGameRecord(store({}), "red"), { ok: false, reason: "incomplete" });
});

test("shouldUndo only when the latest winner is decremented and the score dropped", () => {
  const g = { winner: "blue" };
  assert.equal(shouldUndo(g, "blue", 1, 0), true);
  assert.equal(shouldUndo(g, "red", 1, 0), false);
  assert.equal(shouldUndo(g, "blue", 0, 0), false);
  assert.equal(shouldUndo(null, "blue", 1, 0), false);
});

test("aggregate + heroStatLine: picks, contention, win rate", () => {
  const games = [
    { winner: "blue", blue_picks: ["Chou", "a", "b", "c", "d"], red_picks: ["Joy", "e", "f", "g", "h"], bans: ["Fanny"] },
    { winner: "red", blue_picks: ["chou", "a", "b", "c", "d"], red_picks: ["x", "e", "f", "g", "h"], bans: ["Joy"] },
    { winner: "blue", blue_picks: ["y", "a", "b", "c", "d"], red_picks: ["z", "e", "f", "g", "h"], bans: [] },
    { winner: "red", blue_picks: ["y", "a", "b", "c", "d"], red_picks: ["z", "e", "f", "g", "h"], bans: ["Chou"] },
  ];
  const agg = aggregate(games);
  assert.deepEqual(heroStatLine(agg, "CHOU"), { pick: "2", contention: "75%", winRate: "50%" });
  assert.deepEqual(heroStatLine(agg, "Joy"), { pick: "1", contention: "50%", winRate: "0%" });
  assert.deepEqual(heroStatLine(agg, "Fanny"), { pick: "0", contention: "25%", winRate: "—" });
  assert.deepEqual(heroStatLine(agg, "Nobody"), { pick: "0", contention: "0%", winRate: "—" });
});

test("heroStatLine with no games", () => {
  assert.deepEqual(heroStatLine(aggregate([]), "Chou"), { pick: "0", contention: "0%", winRate: "—" });
});
