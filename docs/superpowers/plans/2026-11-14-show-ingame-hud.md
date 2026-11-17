# Show In-game HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A SHOW INGAME controller button switches the draft browser source to `gameDisplay.html`.
**Architecture:** Same pattern as `show-heroes-display`: controller event → message → page navigates with `location.search`.
**Tech Stack:** Vanilla JS modules, no build.
**Spec:** `docs/superpowers/specs/2026-11-14-show-ingame-hud-design.md`

## Global Constraints
- Message type: `show-ingame-display`. sessionStorage flag key: `overlay-chain` (value `"1"`), accessed in try/catch.
- Bump `?v=` on every changed script/page reference.

## Review Focus
- Standalone gameDisplay OBS source + timer RESET → must stay on the HUD (flag absent).
- Message delivered twice (BroadcastChannel + WebSocket) → single navigation, no error.
- Room query string preserved across every hop.

---

### Task 1: Button + message + navigation (manual browser test; no test harness for pages)

**Files:** `frontend/controller.html`, `frontend/js/control.js`, `frontend/js/heroesDisplay.js`, `frontend/js/display.js`, `frontend/js/gameDisplay.js`, `frontend/heroes-display.html`, `frontend/display.html`, `frontend/gameDisplay.html`, `CLAUDE.md`

- [ ] Add `<button id="show-ingame-display">SHOW INGAME</button>` after SHOW HEROES.
- [ ] `control.js`: map `target: "ingame"` → `show-ingame-display`; wire the button.
- [ ] `heroesDisplay.js` / `display.js`: on `show-ingame-display`, set the flag and load `gameDisplay.html + location.search` (display.js plays the outro first). Set the flag in heroesDisplay's `show-draft-display` too (harmless).
- [ ] `gameDisplay.js`: if flag set, `show-draft-display` → `display.html`, `show-heroes-display` → `heroes-display.html`.
- [ ] Verify: serve the frontend, open controller + heroes-display with the same room, click SHOW INGAME → HUD; click SHOW DRAFT → draft. Open a fresh gameDisplay tab and click SHOW DRAFT → it stays.
- [ ] Update CLAUDE.md, commit.
