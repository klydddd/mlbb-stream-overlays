import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VIEW, normalizeView, readCasterView, readGlobalView, camTransform } from "../js/casterView.js";

const IDENTITY = "translate(0%, 0%) scale(1) scaleX(1)";
const store = (obj) => (k) => (k in obj ? obj[k] : null);

test("defaults give an identity transform", () => {
  assert.equal(camTransform(), IDENTITY);
});

test("global multiplies caster zoom", () => {
  assert.match(camTransform({ zoom: 120 }, { zoom: 110 }), /scale\(1\.32\)/);
});

test("zoom clamps at 4", () => {
  assert.match(camTransform({ zoom: 200 }, { zoom: 200 }), /scale\(4\)/);
});

test("pan can't move past the edge", () => {
  assert.equal(camTransform({}, { x: 100, y: -100 }), IDENTITY);
  assert.equal(camTransform({}, { zoom: 200, x: 100, y: -100 }), "translate(-50%, 50%) scale(2) scaleX(1)");
});

test("mirror is XOR", () => {
  assert.match(camTransform({ mirror: true }, { mirror: false }), /scaleX\(-1\)$/);
  assert.match(camTransform({ mirror: true }, { mirror: true }), /scaleX\(1\)$/);
});

test("missing or garbage values fall back to defaults", () => {
  assert.deepEqual(normalizeView({ zoom: "abc", x: 999, mirror: "1" }), { zoom: 100, x: 100, y: 0, mirror: true });
  assert.deepEqual(readCasterView(() => null, 1), DEFAULT_VIEW);
  assert.equal(camTransform(undefined, { zoom: NaN, x: "nope" }), IDENTITY);
});

test("reads storage keys", () => {
  const get = store({ "caster-zoom-2": "150", "caster-x-2": "-20", "caster-mirror-2": "1" });
  assert.deepEqual(readCasterView(get, 2), { zoom: 150, x: -20, y: 0, mirror: true });
  const getAll = store({ "caster-zoom-all": "130", "caster-mirror-all": "1" });
  assert.deepEqual(readGlobalView(getAll), { zoom: 130, mirror: true });
});
