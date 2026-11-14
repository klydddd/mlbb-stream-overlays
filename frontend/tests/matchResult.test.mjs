import { test } from "node:test";
import assert from "node:assert/strict";
import { bestOf, winsNeeded, matchWinner, matchLost } from "../js/matchResult.js";

const match = (a, b, format) => ({ a: { score: a }, b: { score: b }, format });

test("format parsing", () => {
  assert.equal(bestOf("BO1"), 1);
  assert.equal(bestOf("bo 5"), 5);
  assert.equal(bestOf("Best of 7"), 7);
  assert.equal(bestOf(""), 3);
  assert.equal(bestOf("FINALS"), 3);
  assert.deepEqual(["BO1", "BO3", "BO5"].map(winsNeeded), [1, 2, 3]);
});

test("BO1: one win decides it", () => {
  assert.equal(matchWinner(match(1, 0, "BO1")), "a");
  assert.equal(matchWinner(match(0, 0, "BO1")), null);
});

test("BO3: needs 2 wins", () => {
  assert.equal(matchWinner(match(1, 0, "BO3")), null);
  assert.equal(matchWinner(match(1, 1, "BO3")), null);
  assert.equal(matchWinner(match(2, 1, "BO3")), "a");
  assert.equal(matchWinner(match(0, 2, "BO3")), "b");
});

test("BO5: needs 3 wins", () => {
  assert.equal(matchWinner(match(2, 1, "BO5")), null);
  assert.equal(matchWinner(match(2, 2, "BO5")), null);
  assert.equal(matchWinner(match(3, 2, "BO5")), "a");
  assert.equal(matchWinner(match(1, 3, "BO5")), "b");
});

test("only the loser of a decided match is marked", () => {
  const m = match(2, 1, "BO3");
  assert.equal(matchLost(m, "a"), false);
  assert.equal(matchLost(m, "b"), true);
  assert.equal(matchLost(match(1, 0, "BO3"), "b"), false);
  assert.equal(matchLost({ a: {}, b: {} }, "a"), false); // no scores at all
});
