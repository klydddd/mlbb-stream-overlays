# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

OBS browser-source overlay system for Mobile Legends: Bang Bang tournament streams. A vanilla HTML/CSS/JS frontend (no build step, no bundler, no package.json) plus a Python backend: a FastAPI WebSocket relay and an optional TensorFlow bot that reads the in-game draft screen and pushes hero predictions. The frontend is deployed to Vercel (`https://mlbb-stream-overlays.vercel.app`). There are no tests or linters.

## Commands

```bash
# Backend setup (Python 3.10; tensorflow is pinned to 2.10.0, and pywin32/pygetwindow make the AI bot Windows-only)
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

# WebSocket relay + static frontend server (serves ../../frontend at /)
cd backend/server && uvicorn server:app --port 8080 --host 0.0.0.0
# Health check: GET http://localhost:8080/api/health

# AI draft-recognition bot (calibrates scan regions, then streams predictions)
cd backend && python ai_bot_multi_auto.py      # set WS_URL env to point at a non-local relay
python gpu_check.py                             # verify TensorFlow sees the GPU (see GPU_SETUP_GUIDE.md)
```

For frontend-only work, open `http://localhost:8080/controller.html` and `http://localhost:8080/display.html` with the same `?room=<code>` query string.

## Architecture

### Page pairs
- `controller.html` (operator UI) drives `display.html` (the draft overlay captured by OBS). These two are the core of the app.
- The controller's CASTER CAMS panel (`js/casterCams.js`, shown in SETUP and LIVE) sets 0/1/2 caster cams (vdo.ninja iframes plus names) that `display.html` shows above the draft overlay (`js/casterCamsDisplay.js`, `css/casterCams.css`), under a sponsor strip (`js/draftSponsors.js`) that uses the same `sponsors` data as the in-game slideshow. The keys are `caster-layout`, `caster-name-N` and `caster-link-N`, and the message is `{type: "caster-cams"}`. Caster names are also written into the INGAME casters field.
- Sponsor logos (controller SPONSOR SLIDESHOW panel, `js/sponsors.js`) show on both overlays. `gameDisplay.html` and the center column of `display.html` use the shared `js/sponsorSlideshow.js`. `display.html` can show a top strip instead (`js/sponsorStrip.js`, styled in `css/casterCams.css`); the controller's DRAFT DISPLAY toggle picks one, stored as `sponsor-draft-style` (`center` | `top`).
- `gameDisplay.html` (`js/gameDisplay.js`, `css/gameDisplay.css`) is the in-game overlay: a fixed 1920x1080 stage scaled to fit, showing the scoreboard (team names, score + 3 series pips), minimap frame, casters, map type (icon from `Assets/gameProper/maps/<slug>.png`) and a sponsor logo slideshow in the top-right (`js/sponsors.js` on the controller; localStorage `sponsors` JSON + `sponsor-interval`, message `{type: "sponsors"}`). It is driven by the controller's INGAME mode (`js/ingame.js`). The cam, turtle/lord/replay/item-check messages (`ingame-cam`, `ingame-event`) are sent but not rendered yet. The center logo loads from `Assets/gameProper/league-logo.png` and hides itself if missing. `gameController.html` is unused.
- `index.html` is a landing page.

### Three sync channels
Controller-to-display state moves over three channels at once. A new feature usually has to handle all three, and when one is missing the result is a bug that only shows up in some setups (see `FUNCTIONS.md`):
1. **localStorage**: the persisted state. Keys include `heroPick-N`, `banPick-N`, `blue-team-name`, `red-team-name`, `logo-blue`, `logo-red`, `round-name`, `game-number`, `match-number`, `phase-number`. The display restores itself from these on load and also listens for `storage` events.
2. **BroadcastChannel `"team_channel"`**: delivers messages between tabs in the same browser.
3. **WebSocket** (`js/websocketClient.js` → `backend/server/server.py`): needed when the display runs on another machine or in OBS. The server is a dumb relay that rebroadcasts every message to all *other* clients in the same room (`/ws/{room_code}`). If no `?room=` param is present, the client generates one and writes it into the URL. On localhost it connects to `ws://localhost:8080`; anywhere else it uses the page's own host.

Messages are JSON objects. Most carry a `type` (`switch`, `reset`, `clear-names|picks|bans|scores|cam-links|logos`, `logo-update`, `ai_prediction`). Some older ones have no type and are bare field objects (for example `{ roundName }` or `{ blueTeamName }`). `handleIncomingMessage` in `js/display.js` handles both shapes, and BroadcastChannel and WebSocket messages both go through it. Logo messages are handled separately in `js/showLogo.js`, which sends logos as Base64 data.

### Draft phases
The draft follows a fixed 18-phase sequence for the 5-ban format. `phaseInputMap` in `js/timer.js` maps each phase to the controller inputs it uses, and it must stay in step with `fiveVisualPhases` in `js/activePick.js`, which highlights the active slot on the display. Phase 18 is the final phase, where picks render silently with no voiceline.

### Heroes
`js/hero.js` exports the `heroes` array (`{ name, img, voice }`) and the render helpers (`updateHeroPick`, `updateHeroPickSilent`, `updateBanPick`). To add a hero, add one entry there plus `Assets/HeroPick/<name>.png` and, if available, `Assets/Voicelines/<name>.ogg`. Filenames don't always match the display name (for example `arlot.ogg` and `belerick.png`), so check the actual paths. The AI bot sends names from `backend/mlbb_hero_model_pro/labels.txt`, and those must match the `name` values in `hero.js`. A new hero is only recognized by the bot after the model is retrained.

### AI bot
`ai_bot_multi_auto.py` asks for the room code from the controller URL and captures a chosen window with `mss`. It calibrates 20 regions (`ban-1..10`, `pick-1..10`) and sends `{type: "ai_prediction", data: {slot, slot_type, slot_index, name}}`. `ai_bot_multi.py` and `calibration_multi.py` are the older split versions. Note that the `ai_prediction` handler in `js/display.js` still uses a 6-ban `banIndexMap` (bans 1-6 only), which doesn't match the bot's 10 ban slots.

### OBS integration
`js/obsWebsocket/showDisplay.js` connects to the local OBS WebSocket (`ws://localhost:4455`) and creates the "Draft Overlay" browser source, pointing it at the hosted `display.html`.

## Notes
- `FUNCTIONS.md` is an audit of every controller control, covering its status, known sync bugs and unimplemented features (score add/deduct buttons, game overlays). Check it before working on controller features.
- `controller.html` loads some scripts as ES modules (`control.js`, `clear.js`, `showLogo.js`, `autocomplete.js`) and others as classic scripts (`swap.js`, `timer.js`, `showDisplay.js`). Classic scripts can't `import` `send`, which is why `swap.js` doesn't sync over WebSocket.
