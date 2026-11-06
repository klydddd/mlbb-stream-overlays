// gameDisplayAnim.js — animations for the in-game overlay (gameDisplay.html).
// Used by js/gameDisplay.js: intro on load, score / pip changes, text swaps
// (team names, casters, map type), panel show / hide and the team switch.
//
// Same rule as the draft outro (js/display.js): no opacity fades. OBS composites
// semi-transparent pixels onto a transparent background, which makes the white
// panels look grey mid-fade. Everything here moves with clip-path, translate or
// scale instead. Individual `translate` / `scale` properties are used because
// several elements already use `transform` (name squeeze, pip skew, logo centering).

const OUT = "cubic-bezier(0.22, 1, 0.36, 1)"; // fast start, soft landing
const IN = "cubic-bezier(0.55, 0, 0.75, 0.2)"; // soft start, fast exit
const POP = "cubic-bezier(0.34, 1.56, 0.64, 1)"; // slight overshoot

const REDUCED = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

export function anim(el, keyframes, { duration = 400, delay = 0, easing = OUT, fill = "both" } = {}) {
  if (!el) return null;
  return el.animate(keyframes, {
    duration: REDUCED ? 0 : duration,
    delay: REDUCED ? 0 : delay,
    easing,
    fill,
  });
}

const done = (a) => (a ? a.finished.catch(() => {}) : Promise.resolve());

// ---------- clip-path shapes ----------
// Each sloped panel collapses onto the edge that faces the center of the screen.
// Same vertex count and order as the CSS polygons in css/gameDisplay.css, so they interpolate.
const SHAPES = {
  sideBlue: ["polygon(0 0, 502px 0, 100% 100%, 27px 100%)", "polygon(502px 0, 502px 0, 100% 100%, 100% 100%)"],
  sideRed: ["polygon(27px 0, 100% 0, 502px 100%, 0 100%)", "polygon(27px 0, 27px 0, 0 100%, 0 100%)"],
  plateBlue: ["polygon(0 0, 301px 0, 100% 100%, 17px 100%)", "polygon(301px 0, 301px 0, 100% 100%, 100% 100%)"],
  plateRed: ["polygon(15px 0, 100% 0, 299px 100%, 0 100%)", "polygon(15px 0, 15px 0, 0 100%, 0 100%)"],
};
const open = ([full, closed]) => [{ clipPath: closed }, { clipPath: full }];
const close = ([full, closed]) => [{ clipPath: full }, { clipPath: closed }];

const FULL = "inset(0 0 0 0)";
// text anchored on the left: erases right-to-left, writes left-to-right (mirrored for "right")
const HIDDEN_TEXT = { left: "inset(0 100% 0 0)", right: "inset(0 0 0 100%)" };

// ---------- Intro (page load / OBS source refresh) ----------

export function playIntro() {
  // 1. White band opens out from the middle of the screen (x = 960 on the stage)
  anim($(".sb-band"), [{ clipPath: "inset(0 60.6% 0 39.4%)" }, { clipPath: FULL }], { duration: 550 });

  // 2. Timer + league logo drop in
  anim($(".sb-center"), [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: FULL }], { duration: 400, delay: 150 });
  anim($(".sb-logo"), [{ scale: "0.6" }, { scale: "1" }], { duration: 600, delay: 200, easing: POP });

  // 3. Team sides spread out from the center
  anim($(".sb-side.blue"), open(SHAPES.sideBlue), { duration: 550, delay: 250 });
  anim($(".sb-side.red"), open(SHAPES.sideRed), { duration: 550, delay: 250 });

  // 4. Name plates follow, then the names write in
  anim($(".blue .sb-plate"), open(SHAPES.plateBlue), { duration: 500, delay: 480 });
  anim($(".red .sb-plate"), open(SHAPES.plateRed), { duration: 500, delay: 480 });
  anim($("#blue-name"), [{ clipPath: HIDDEN_TEXT.left }, { clipPath: FULL }], { duration: 450, delay: 650 });
  anim($("#red-name"), [{ clipPath: HIDDEN_TEXT.right }, { clipPath: FULL }], { duration: 450, delay: 650 });

  // 5. Stat icons drop from the top edge, center-out
  ["blue", "red"].forEach((side) => {
    const icons = $$(`.${side} .sb-icons .ic`);
    if (side === "blue") icons.reverse(); // blue's center-most icon is the last one
    icons.forEach((ic, i) => {
      anim(ic, [{ translate: "0 -34px" }, { translate: "0 0" }], { duration: 420, delay: 600 + i * 60 });
    });
  });

  // 6. Pips grow out from the name side, scores pop
  ["blue", "red"].forEach((side) => {
    const pips = [...$(`#${side}-pips`).children];
    if (side === "red") pips.reverse();
    pips.forEach((pip, i) => {
      anim(pip, [{ scale: "0 1" }, { scale: "1 1" }], { duration: 350, delay: 760 + i * 70 });
    });
    anim($(`#${side}-score`), [{ scale: "0" }, { scale: "1" }], { duration: 600, delay: 720, easing: POP });
  });

  // 7. Minimap frame draws out from its top-left corner
  anim($(".minimap-frame"), [{ clipPath: "inset(0 100% 100% 0)" }, { clipPath: FULL }], { duration: 650, delay: 300 });

  // 8. Right column: sponsors drop in, then casters and map slide in from the right edge
  anim($(".sponsors"), [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: FULL }], { duration: 450, delay: 450 });
  anim($(".casters"), [{ clipPath: "inset(0 0 0 100%)" }, { clipPath: FULL }], { duration: 500, delay: 800 });
  anim($(".map-type"), [{ clipPath: "inset(0 0 0 100%)" }, { clipPath: FULL }], { duration: 500, delay: 920 });
  anim($(".map-type-icon"), [{ translate: "-83px 0" }, { translate: "0 0" }], { duration: 500, delay: 1050 });
}

// ---------- Text swap: old value wipes out, new value wipes in ----------

export async function wipeSwap(el, anchor, apply) {
  const out = anim(el, [{ clipPath: FULL }, { clipPath: HIDDEN_TEXT[anchor] }], { duration: 220, easing: IN });
  await done(out);
  apply();
  const inn = anim(el, [{ clipPath: HIDDEN_TEXT[anchor] }, { clipPath: FULL }], { duration: 380 });
  await done(inn);
  out?.cancel();
  inn?.cancel();
}

// ---------- Right-column panels (casters, map type): slide in / out at the right edge ----------

export async function revealPanel(el) {
  const a = anim(el, [{ clipPath: "inset(0 0 0 100%)" }, { clipPath: FULL }], { duration: 450 });
  await done(a);
  a?.cancel();
}

export async function concealPanel(el) {
  const a = anim(el, [{ clipPath: FULL }, { clipPath: "inset(0 0 0 100%)" }], { duration: 300, easing: IN });
  await done(a);
  return a; // caller hides the panel, then cancels this so it doesn't stick
}

// map icon box: slides out to the left (behind the panel edge) and back
export async function swapIcon(el, apply) {
  const out = anim(el, [{ clipPath: FULL }, { clipPath: "inset(100% 0 0 0)" }], { duration: 220, easing: IN });
  await done(out);
  apply();
  const inn = anim(el, [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: FULL }], { duration: 380 });
  await done(inn);
  out?.cancel();
  inn?.cancel();
}

// ---------- Score / pips ----------

// up: the score went up -> number pops, newly won pips flash white and stretch
export function scoreChanged(scoreEl, newPips, up) {
  if (up) {
    anim(scoreEl, [{ scale: "1" }, { scale: "1.45", offset: 0.35 }, { scale: "1" }], { duration: 650, easing: "ease-out", fill: "none" });
    newPips.forEach((pip, i) => {
      anim(pip, [
        { scale: "1 1", background: "var(--team)" },
        { scale: "1.2 2.2", background: "#ffffff", offset: 0.3 },
        { scale: "1 1", background: "var(--team)" },
      ], { duration: 700, delay: 120 + i * 90, easing: "ease-out", fill: "none" });
    });
  } else {
    anim(scoreEl, [{ scale: "1" }, { scale: "0.7", offset: 0.4 }, { scale: "1" }], { duration: 400, easing: "ease-out", fill: "none" });
  }
}

// ---------- Team switch ----------
// Both name plates fold into the center edge, the names change while hidden,
// then the plates unfold again.
export async function playSwitch(apply) {
  const outs = [
    anim($(".blue .sb-plate"), close(SHAPES.plateBlue), { duration: 300, easing: IN }),
    anim($(".red .sb-plate"), close(SHAPES.plateRed), { duration: 300, easing: IN }),
  ];
  await Promise.all(outs.map(done));
  apply();
  const ins = [
    anim($(".blue .sb-plate"), open(SHAPES.plateBlue), { duration: 450 }),
    anim($(".red .sb-plate"), open(SHAPES.plateRed), { duration: 450 }),
    anim($("#blue-name"), [{ translate: "60px 0" }, { translate: "0 0" }], { duration: 450 }),
    anim($("#red-name"), [{ translate: "-60px 0" }, { translate: "0 0" }], { duration: 450 }),
  ];
  await Promise.all(ins.map(done));
  [...outs, ...ins].forEach((a) => a?.cancel());
}
