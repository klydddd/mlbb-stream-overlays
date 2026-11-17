# Caster cam zoom, position and mirror

## Intent
The operator needs to frame each caster's vdo.ninja cam from the controller during a show:
zoom in, move the frame onto the caster, and mirror the image. There are per-caster controls
plus a global control that affects both cams. This applies everywhere the cams show:
`display.html` and `cams.html` (both use `js/casterCamsDisplay.js`).

## Goals
- Per caster: zoom, horizontal/vertical position, mirror, reset.
- Global (ALL CAMS): zoom and mirror, plus reset.
- Changes show live on the overlay without reconnecting the feed.

## Non-goals
- No global position. The two webcams are framed differently, so one shared position makes no sense.
- No zooming out below 100%, which would show empty edges.
- No changes to the vdo.ninja URL or stream itself. This is display-side cropping only.

## Anti-goals
- The feed must never reload or reconnect when a slider moves.
- No black or empty edges at any slider combination.
- No per-frame JS. The fix is a static CSS transform (see `AUDIT_OPTIMIZATION.md`).

## Approaches
- **A. Global multiplies (picked by the user).** Effective zoom = global × caster. Effective
  mirror = global XOR caster. Sets a base for both cams, then fine-tunes one.
- B. Global writes its value into both casters' controls. Simpler, but loses individual tweaks.
- C. Global overrides while it's on. Hides the per-caster values, which is confusing mid-show.

Zoom target: **zoom + position (picked by the user)** rather than center-only. Center-only
cuts off off-center casters.

## Design
**Controller** (`controller.html` CASTER CAMS panel, `js/casterCams.js`): each caster row
gets a second line with sliders for ZOOM (100–200%, step 5), X (−100…100) and Y (−100…100),
plus a MIRROR toggle and a RESET button. The rows show or hide with the layout, as the
existing rows do. An ALL CAMS line (ZOOM, MIRROR, RESET) shows whenever the cams are on.
Sliders update live on `input`, and each value is shown next to its slider.

**State**
- localStorage: `caster-zoom-N`, `caster-x-N`, `caster-y-N`, `caster-mirror-N` (N = 1, 2),
  plus `caster-zoom-all` and `caster-mirror-all`.
  Missing values mean the defaults: zoom 100, position 0, mirror off.
- Message: the existing `{type: "caster-cams"}` gains
  `casters[i].view = {zoom, x, y, mirror}` and a top-level `view = {zoom, mirror}`.
  The keys start with `caster-`, so the existing storage listeners on the controller and
  display already react to them.
- RESET DRAFT clears these keys along with the other `caster-*` keys (as it does today).

**Display** (`js/casterCamsDisplay.js`): sets one inline transform on each iframe:
`s = clamp(globalZoom × casterZoom, 1, 4)`, and the most the cam can move without showing an
edge is `max = (s − 1) / 2 × 100%`.
`transform: translate(−x/100 × max, −y/100 × max) scale(s) scaleX(mirror ? −1 : 1)`,
with `transform-origin: center`. The translate comes before the flip, so X+ always shows
more of the right side of the frame on screen, mirrored or not. `.caster-cam-frame` already
clips with `overflow: hidden`. Only the transform changes, so the feed never reloads.

## Left to the builder
- Slider styling in `css/controller.css`, matching the existing panel.
- Throttling: sending on every `input` event is acceptable (the messages are small). A
  `requestAnimationFrame` throttle is optional.
