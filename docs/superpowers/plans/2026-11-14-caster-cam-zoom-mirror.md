# Caster Cam Zoom / Position / Mirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator zoom, position and mirror each caster cam, plus a global zoom/mirror, from the controller, applied on `display.html` and `cams.html`.

**Architecture:** A pure module `js/casterView.js` reads view values from storage and turns (global, caster) views into one CSS transform string. The controller (`js/casterCams.js`) stores the values and adds them to the existing `caster-cams` message. The display (`js/casterCamsDisplay.js`) sets that transform on each iframe; the frame already clips.

**Tech Stack:** Vanilla ES modules, no build step; `node --test` for the pure module.

**Spec:** `docs/superpowers/specs/2026-11-14-caster-cam-zoom-mirror-design.md`

## Global Constraints
- Zoom slider 100–200, step 5 (percent). Position sliders −100…100, step 1. Defaults: zoom 100, x 0, y 0, mirror off.
- Effective zoom = global × caster, clamped to [1, 4]. Effective mirror = global XOR caster.
- Max pan = (s − 1) / 2 × 100%; transform = `translate(${-x/100*max}%, ${-y/100*max}%) scale(s) scaleX(±1)`.
- Keys: `caster-zoom-N`, `caster-x-N`, `caster-y-N`, `caster-mirror-N` (N = 1, 2), `caster-zoom-all`, `caster-mirror-all`. Mirror stored as `"1"` or removed.
- Message: `casters[i].view = {zoom, x, y, mirror}`, top-level `view = {zoom, mirror}`.
- Never change the iframe `src` for a view change. No per-frame JS.
- Bump `?v=` on every changed script/stylesheet tag (cache busting on OBS/Vercel).

## Review Focus
- RESET DRAFT clears localStorage and text inputs; the range inputs must come back to defaults (zoom 100, x/y 0), not the browser's range midpoint. → Task 3 manual check 4.
- Old messages without `view` (older controller tab) must render at defaults, not `NaN` transforms. → Task 1 test `missing or garbage values fall back to defaults`.
- Global 200% × caster 200% must clamp to 400%, and x = 100 at zoom 100% must not move the image. → Task 1 tests.
- Mirror on both global and caster must cancel out. → Task 1 test.
- `cams-request` resend must include views, so a freshly loaded `cams.html` frames correctly. → Task 3 manual check 5.

---

### Task 1: Pure view module

**Files:**
- Create: `frontend/js/casterView.js`
- Test: `frontend/tests/casterView.test.mjs`

**Interfaces:**
- Produces:
  - `DEFAULT_VIEW = {zoom: 100, x: 0, y: 0, mirror: false}`
  - `normalizeView(v?: object) -> {zoom, x, y, mirror}` — clamps zoom to 100–200, x/y to −100…100, non-numbers → defaults, mirror → boolean.
  - `readCasterView(get: (key) => string|null, n: 1|2) -> view`
  - `readGlobalView(get) -> {zoom, mirror}`
  - `camTransform(globalView?, casterView?) -> string`

- [ ] **Step 1: Write the failing tests** in `frontend/tests/casterView.test.mjs`:
  - `defaults give an identity transform`: `camTransform()` === `"translate(0%, 0%) scale(1) scaleX(1)"`.
  - `global multiplies caster zoom`: `camTransform({zoom:120}, {zoom:110})` contains `scale(1.32)`.
  - `zoom clamps at 4`: `camTransform({zoom:200}, {zoom:200})` contains `scale(4)`.
  - `pan can't move past the edge`: `camTransform({}, {x:100, y:-100})` === identity string; `camTransform({}, {zoom:200, x:100, y:-100})` === `"translate(-50%, 50%) scale(2) scaleX(1)"`.
  - `mirror is XOR`: `{mirror:true}` + `{mirror:false}` → `scaleX(-1)`; both true → `scaleX(1)`.
  - `missing or garbage values fall back to defaults`: `normalizeView({zoom:"abc", x:999, mirror:"1"})` deep-equals `{zoom:100, x:100, y:0, mirror:true}`; `readCasterView(() => null, 1)` deep-equals `DEFAULT_VIEW`.
  - `reads storage keys`: with a store `{"caster-zoom-2":"150","caster-x-2":"-20","caster-mirror-2":"1"}`, `readCasterView(get, 2)` → `{zoom:150, x:-20, y:0, mirror:true}`; `readGlobalView` with `{"caster-zoom-all":"130","caster-mirror-all":"1"}` → `{zoom:130, mirror:true}`.

- [ ] **Step 2: Run** `node --test frontend/tests/casterView.test.mjs` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `frontend/js/casterView.js`. Round the scale and translate numbers to 4 decimals to avoid float noise (`1.32` not `1.3200000000000003`); format `-0` as `0`.

- [ ] **Step 4: Run** `node --test frontend/tests/` — Expected: all pass (including existing tests).

- [ ] **Step 5: Commit** `feat: caster cam view math (zoom, pan, mirror)`.

### Task 2: Display applies the view

**Files:**
- Modify: `frontend/js/casterCamsDisplay.js`
- Modify: `frontend/display.html`, `frontend/cams.html` (bump `casterCamsDisplay.js?v=`)
- Modify: `frontend/css/casterCams.css`, `frontend/css/cams.css` (`.caster-cam-frame iframe { transform-origin: center; }`) + bump their `?v=`

**Interfaces:**
- Consumes: `normalizeView`, `readCasterView`, `readGlobalView`, `camTransform` from Task 1.

- [ ] **Step 1:** `fromStorage()` adds `view: readGlobalView(ls)` and `casters[i].view: readCasterView(ls, i+1)`.
- [ ] **Step 2:** `render()` sets `frame.style.transform = camTransform(data.view, caster?.view)` for each cam (independent of the `src` check, so the feed never reloads). Missing `view` → defaults through `normalizeView`.
- [ ] **Step 3: Verify** in the browser: open `display.html?room=t`, run in console `localStorage.setItem("caster-layout","2"); localStorage.setItem("caster-zoom-1","200"); localStorage.setItem("caster-mirror-all","1")` from another tab of the same origin → cam 1 zoomed 2× and both flipped. `node --test frontend/tests/` still passes.
- [ ] **Step 4: Commit** `feat: caster cams render zoom/position/mirror`.

### Task 3: Controller controls

**Files:**
- Modify: `frontend/controller.html` (CASTER CAMS panel, bump `casterCams.js?v=` and `controller.css?v=`)
- Modify: `frontend/js/casterCams.js`
- Modify: `frontend/css/controller.css` (after `.caster-row input.invalid`, ~line 1016)

**Interfaces:**
- Consumes: `readCasterView`, `readGlobalView`, `DEFAULT_VIEW` from Task 1.

- [ ] **Step 1: Markup.** Under each `.caster-row[data-caster-slot=N]`, add a `.caster-view-row` with the same `data-caster-slot="N"` (so the existing show/hide in `render()` covers it) containing: `ZOOM` range `id="caster-zoom-N"` (100–200, step 5) + value `<output>`; `X` range `id="caster-x-N"` (−100…100); `Y` range `id="caster-y-N"`; `MIRROR` `.toggle-btn` `id="caster-mirror-N"` with `aria-pressed`; `RESET` button `id="caster-view-reset-N"`. Add one `.caster-view-row` `id="caster-view-all"` labelled `ALL CAMS` with `caster-zoom-all`, `caster-mirror-all`, `caster-view-reset-all`; it is hidden when layout is `""`. Layout as in the sketch:
  ```
  CASTER 1  ZOOM ──●── 120%   X ──●── 0   Y ──●── 0   [MIRROR] [RESET]
  ALL CAMS  ZOOM ──●── 100%                           [MIRROR] [RESET]
  ```
- [ ] **Step 2: Wiring** in `js/casterCams.js`:
  - `state()` adds `view: readGlobalView(get)` and `casters[i].view: readCasterView(get, n)`.
  - Range `input` events: `store(key, value === default ? "" : value)` then `broadcast()`; update the `<output>`.
  - Mirror click: toggle `"1"`/removed, `aria-pressed`, `broadcast()`.
  - Reset buttons remove that row's keys, `render()`, `broadcast()`.
  - `render()` sets every range, output and mirror button from storage via `readCasterView`/`readGlobalView` (this restores defaults after RESET DRAFT), and hides `#caster-view-all` when layout is off.
- [ ] **Step 3: Styles.** `.caster-view-row` matches `.caster-row` spacing; ranges ~110px wide; outputs fixed width so the row doesn't jump.
- [ ] **Step 4: Manual checks** (controller + `display.html` + `cams.html`, same `?room=`):
  1. Each slider moves only its cam live; the feed doesn't reload (iframe `src` unchanged in DevTools).
  2. ALL CAMS zoom 150 + caster 1 zoom 150 → cam 1 at 2.25×, cam 2 at 1.5×.
  3. Mirror on ALL and caster 1 → cam 1 normal, cam 2 flipped.
  4. RESET DRAFT → all sliders show 100 / 0 / 0, mirrors off, cams unzoomed.
  5. Reload `cams.html` → it comes back framed the same (`cams-request` resend).
  6. `node --test frontend/tests/` passes.
- [ ] **Step 5: Commit** `feat: caster cam zoom/position/mirror controls`.

### Task 4: Docs

**Files:**
- Modify: `CLAUDE.md` (CASTER CAMS bullet)

- [ ] **Step 1:** Add the new keys, the `view` message fields, that global multiplies/XORs with each caster, and `js/casterView.js` + its test to the tests list ("the only tests in the repo" sentence).
- [ ] **Step 2: Commit** `docs: caster cam view controls`.
