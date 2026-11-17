# Show the in-game HUD after the heroes lineup

## Intent
After the draft, the single draft browser source (`display.html` → `heroes-display.html`) should be able to
move on to the live HUD (`gameDisplay.html`) without the operator switching OBS scenes. The operator decides
when, with a button. No timer.

## Approaches
- **Operator button (picked):** a SHOW INGAME button in the controller's DRAFT CONTROL panel.
- Auto timer on the heroes page: rejected by the user.
- Separate OBS scene for `gameDisplay.html`: needs no code, so it isn't this request.

## Design
- Controller: `#show-ingame-display` button next to SHOW HEROES / SHOW DRAFT. It dispatches
  `draft-display-switch` with `target: "ingame"`, and `control.js` sends `{type: "show-ingame-display"}` over
  BroadcastChannel + WebSocket.
- `heroes-display.html` and `display.html` load `gameDisplay.html` + the same query string when that message arrives.
- `gameDisplay.html` reached this way goes back on `show-draft-display` (SHOW DRAFT / timer RESET) and
  `show-heroes-display`. The pages set a sessionStorage flag (`overlay-chain`) before they navigate, and
  gameDisplay only obeys those messages when the flag is set. That way a standalone gameDisplay OBS source is
  never moved off the HUD by a timer reset. (Builder's call.)

## Non-goals
- Exit/enter animation between heroes and HUD (hard cut for now).
