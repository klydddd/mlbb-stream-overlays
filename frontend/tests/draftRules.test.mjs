import { test } from "node:test";
import assert from "node:assert/strict";
import { takenHeroes, isTaken } from "../js/draftRules.js";

const store = (obj) => (k) => (k in obj ? obj[k] : null);
const draft = store({ "heroPick-1": "Chou", "heroPick-6": " Joy ", "banPick-3": "Fanny", "banPick-4": "" });

test("picks and bans from both teams are taken, case-insensitive", () => {
  assert.deepEqual([...takenHeroes(draft)].sort(), ["chou", "fanny", "joy"]);
  assert.equal(isTaken(draft, "CHOU", "heroPick-2"), true);
  assert.equal(isTaken(draft, "joy", "banPick-1"), true);
  assert.equal(isTaken(draft, "Fanny", "heroPick-9"), true);
});

test("a slot doesn't block its own hero", () => {
  assert.equal(isTaken(draft, "Chou", "heroPick-1"), false);
  assert.equal(isTaken(draft, "Fanny", "banPick-3"), false);
});

test("free heroes and empty input are not taken", () => {
  assert.equal(isTaken(draft, "Ling", "heroPick-2"), false);
  assert.equal(isTaken(draft, "  ", "heroPick-2"), false);
});
