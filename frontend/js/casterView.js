// casterView.js — zoom / position / mirror for the caster cams.
// The controller (js/casterCams.js) stores the values; the overlays (js/casterCamsDisplay.js)
// turn them into one CSS transform on each cam's iframe. The frame clips (overflow: hidden),
// so zoom crops instead of growing the cam, and nothing reloads the feed.
//
// localStorage, per caster N (1, 2): caster-zoom-N (100-200 %), caster-x-N, caster-y-N
// (-100..100, share of the pan the zoom allows), caster-mirror-N ("1" = on).
// Global (ALL CAMS): caster-zoom-all, caster-mirror-all.
// Global zoom multiplies each caster's zoom; global mirror flips on top of each caster's.

export const DEFAULT_VIEW = Object.freeze({ zoom: 100, x: 0, y: 0, mirror: false });
const MAX_SCALE = 4;

function num(value, fallback, min, max) {
  const n = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const isOn = (value) => value === true || value === 1 || value === "1";

export function normalizeView(v = {}) {
  v = v || {};
  return {
    zoom: num(v.zoom, DEFAULT_VIEW.zoom, 100, 200),
    x: num(v.x, DEFAULT_VIEW.x, -100, 100),
    y: num(v.y, DEFAULT_VIEW.y, -100, 100),
    mirror: isOn(v.mirror),
  };
}

export function readCasterView(get, n) {
  return normalizeView({
    zoom: get(`caster-zoom-${n}`),
    x: get(`caster-x-${n}`),
    y: get(`caster-y-${n}`),
    mirror: get(`caster-mirror-${n}`),
  });
}

export function readGlobalView(get) {
  const { zoom, mirror } = normalizeView({ zoom: get("caster-zoom-all"), mirror: get("caster-mirror-all") });
  return { zoom, mirror };
}

// 4 decimals, and never "-0"
const fmt = (n) => String(Math.round(n * 1e4) / 1e4 || 0);

export function camTransform(globalView, casterView) {
  const g = normalizeView(globalView);
  const c = normalizeView(casterView);
  const s = Math.min(MAX_SCALE, (g.zoom / 100) * (c.zoom / 100));
  // the furthest the zoomed image can move before an edge shows, in % of the frame
  const max = ((s - 1) / 2) * 100;
  // X+ shows more of the right side, Y+ more of the bottom (translate is outside the flip)
  const tx = (-c.x / 100) * max;
  const ty = (-c.y / 100) * max;
  const flip = g.mirror !== c.mirror ? -1 : 1;
  return `translate(${fmt(tx)}%, ${fmt(ty)}%) scale(${fmt(s)}) scaleX(${flip})`;
}
