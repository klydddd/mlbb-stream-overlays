# Overlay Performance Audit

How to make the OBS browser sources lighter. The audit covered the five overlay pages
(`display.html`, `heroes-display.html`, `gameDisplay.html`, `waiting.html`, `cams.html`):
their CSS animations, JS timers, assets and cam iframes.

These findings come from reading the code, not from profiling it. Each impact rating is
based on how browsers render that technique. After each fix, check it in Chrome DevTools:
Performance panel → record about 10 s during an active pick, and turn on Rendering →
"Paint flashing".

`gameDisplay.html`, `waiting.html` and `cams.html` are already light. They mostly animate
`transform`/`opacity`, and the grain image is drawn once (`js/grain.js`). Almost all of the
cost is in **`display.html`**, with some in **`heroes-display.html`**.

**Fix order:** #1 (OBS link and settings changes only), #4 (small bug fix), then #2 and #3
(the biggest code wins), then the rest.

**Rule for every animation fix:** animate only `transform` and `opacity`. Browsers redraw
the element on the CPU every frame when you animate `box-shadow`, `filter`,
`background-position`, `background-size`, `width`, `height`, `top` or `left`.

---

## High impact

### 1. Caster cams (vdo.ninja iframes): probably the biggest single cost
Every live cam is a WebRTC video decode running inside OBS's built-in browser. With 2 cams
on `display.html` and `cams.html` as a second source, OBS can be decoding 2–4 video
streams at once.

- [ ] Add `&codec=h264` to the cam links so the graphics card decodes the video.
- [ ] Add `&maxframerate=30` to the cam links.
- [ ] Add `&noaudio` if caster audio reaches OBS another way.
- [ ] Don't have `display.html` (with cams on) and `cams.html` both active at the same time.

The teardown of hidden cams in `frontend/js/casterCamsDisplay.js` (`setCam` removes `src`)
is already correct. Leave it as it is.

### 2. Active pick slot glow repaints every frame
`frontend/css/display.css:469-558` (`.blue-picks`, `.red-picks`, their `::before`, and
`@keyframes pick-backdrop`, `pick-bloom`, `pick-sparks`)

- `pick-bloom` animates `background-size`.
- `pick-sparks` and `pick-backdrop` animate `background-position`.
- `::before` stacks 5 gradient layers under a `mask-image`.

Browsers can't hand these properties to the GPU, so the whole slot is redrawn on the CPU
60 times a second for the entire draft.

**Fix:**
- [ ] **Backdrop:** draw the gradient once on a child or pseudo-element that is twice the slot
      size, and animate `transform: translate(...)` instead of `background-position`.
- [ ] **Sparks:** put them on their own element with a tall repeating tile
      (`height: calc(100% + 106px)`) and animate `transform: translateY(-106px)`. Keep the
      whole-tile distance so the loop stays seamless.
- [ ] **Bloom:** put it on its own element with a fixed `radial-gradient`, and animate
      `transform: scaleY(...)` with `transform-origin: bottom`, plus `opacity`.
- [ ] Keep the mask on the parent wrapper only, which doesn't animate.
- [ ] Add `contain: paint` to the slot so any remaining redraws stay inside it.

```css
/* sketch */
.pick-glow { position: absolute; inset: 0; overflow: hidden; pointer-events: none;
             mask-image: linear-gradient(to top, #000 0%, #000 22%, transparent 50%); }
.pick-glow .sparks { position: absolute; left: 0; right: 0; bottom: -106px; height: calc(100% + 106px);
                     background: radial-gradient(...) 0 0 / 37px 53px;
                     animation: sparks-up 3.4s linear infinite; will-change: transform; }
.pick-glow .bloom  { position: absolute; inset: 0; transform-origin: 50% 100%;
                     background: radial-gradient(ellipse 50% 100% at 50% 100%, ...);
                     animation: bloom 2.6s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate; }
@keyframes sparks-up { to { transform: translateY(-106px); } }
@keyframes bloom { from { transform: scaleY(0.5); opacity: .8; } to { transform: scaleY(1); opacity: 1; } }
```

These elements are added in `frontend/js/activePick.js` (or kept in the markup and turned
on by the `.blue-picks`/`.red-picks` classes that file already sets).

### 3. Pick and ban animations that redraw expensive shadows and filters
- **Ban glow:** `.bans { animation: white-glow 1s infinite }` (`frontend/css/display.css:560`,
  keyframes at `:444`). It animates `box-shadow`, so the ban slot is redrawn every frame for
  the whole ban phase.
- **Lock-in flash:** `blue-select`/`red-select` (`frontend/css/display.css:416-463`, and the
  same code in `frontend/css/heroes-display.css:558-590`). It animates an **inset
  `box-shadow` with a 300px blur**, one of the most expensive things to draw, on every
  lock-in.

**Fix:**
- [ ] Move each glow to a `::after` that has a **fixed** inset shadow or radial gradient, and
      animate only `opacity`.

```css
.bans::after { content: ''; position: absolute; inset: 0; pointer-events: none;
               box-shadow: inset 0 0 20px rgba(255,255,255,.7);
               animation: glow-pulse 1s infinite; }
@keyframes glow-pulse { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }

.media-container.blue-select::after { content: ''; position: absolute; inset: 0; pointer-events: none;
               background: radial-gradient(ellipse at center, transparent 0%, rgb(135,185,245) 100%);
               animation: flash 1s ease-out; }
@keyframes flash { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
```

Make sure the container is `position: relative`, and that the new `::after` doesn't clash
with an existing `::after` on the same element. `.pick-section-background .media-container:after`
is the shimmer from #7. The flash containers are the foreground `#hero-N` ones, so they
should be free.

### 4. Timers that are never stopped in `frontend/js/hero.js`
`updateHeroPick` (`hero.js:228`) and `updateHeroPickSilent` (`hero.js:289`) each start a
`setInterval` (the random glow) and never clear it. Every re-render, restore, swap, reset
or re-sent message adds another one. Over a long stream they pile up and keep switching
classes on images that were already removed.

**Fix:**
- [ ] Copy the approach from `frontend/js/heroesDisplay.js:95-120`: store the timers for
      each slot and clear them before rendering the slot again.

```js
const slotTimers = new Map(); // container -> [timer ids]
function clearSlotTimers(container) {
  (slotTimers.get(container) || []).forEach((t) => { clearTimeout(t); clearInterval(t); });
  slotTimers.set(container, []);
}
function track(container, id) { slotTimers.get(container).push(id); return id; }
// at the top of updateHeroPick / updateHeroPickSilent (and in the empty-slot branch):
clearSlotTimers(container);
// wrap every setTimeout/setInterval in those functions with track(container, ...)
```

The `updateBanPick` timeouts (`hero.js:~305-320`) can also pile up when bans are re-sent
quickly. Track those the same way.

### 5. The random glow switches a `drop-shadow` filter on 10 portraits
`frontend/css/display.css:386-409` (`.glow-blue-1..3`, `.glow-red-1..3`), switched by the
intervals from #4. The same pattern is in `frontend/css/heroes-display.css:524-546`. Each
switch makes the browser redraw `brightness() saturate() drop-shadow()` on a large image
that is already moving (`.float`).

**Fix:**
- [ ] Use one static glow layer per portrait: a sibling element or `::after` on the container
      with a pre-blurred team-coloured `radial-gradient`. Fade its `opacity` with a CSS
      `animation` and an `animation-delay` that differs per slot to keep the random feel.
- [ ] Remove the JS interval completely. This also takes care of most of #4.
- [ ] If the brightness boost has to stay, put a constant `filter` on the image (no change
      over time), so it is drawn only once.

---

## Medium impact

### 6. Draft timer redraws every frame
`frontend/js/displayTimer.js`
- `animateProgress` (`:16-35`) writes `textContent`, sets `transform` and toggles
  `.warning` 60 times a second for each 50 s phase.
- `setInterval(checkForUpdates, 100)` (`:92`) reads localStorage 10 times a second.

**Fix:**
- [ ] Drive the progress bar with one CSS transition: set `scaleX(1)`, force a reflow, then
      set `transition: transform ${remaining}s linear; transform: scaleX(0)`. No JS runs
      per frame.
- [ ] Update the number with a `setTimeout` lined up to each whole second. Write
      `textContent` only when the value changes, and toggle `.warning` once when it reaches 10.
- [ ] Replace the 100 ms polling with `window.addEventListener('storage', e => { if (e.key === 'draftUpdate') updateDisplay(); })`.
      Keep one `updateDisplay()` call on load.

### 7. Shimmer that never stops
`frontend/css/display.css:614` runs ten `.pick-section-background .media-container:after`
shimmers (`animation: slide 1.5s infinite`) forever, even behind heroes that are already
locked.

**Fix:**
- [ ] Stop the shimmer once the slot is filled:
```css
.pick-section-background .media-container.has-player-photo:after,
.pick-section-background .media-container.filled:after { animation: none; display: none; }
```
  You'll need a `filled` class on the background slot when its hero locks (from
  `display.js`/`hero.js`), because the hero image is in a different container
  (`#hero-N`). Alternatively, use `:has()` on a shared parent.
- `frontend/css/heroes-display.css:278` already stops on `.card.picked`. No change needed.

---

## OBS settings (no code changes)
- [ ] Turn on Settings → Advanced → Sources → **Enable Browser Source Hardware Acceleration**.
- [ ] Set every browser source to exactly **1920×1080**, not 4K and not scaled up.
- [ ] Set the browser source frame rate to **30 fps** unless the stream itself runs at 60.
- [ ] For sources not in the current scene, tick **Shutdown source when not visible**. It
      works with the `obsSourceActiveChanged` intro replay in `js/gameDisplay.js`. The catch
      is that the page reloads when it comes back on screen and restores its state from
      localStorage and the next WebSocket messages. `waiting.html` and `cams.html` ask for
      state on connect (`waiting-request`, `cams-request`), so they recover fully.
- [ ] Keep using the overlay chain (`js/overlayChain.js`, one source that switches between
      pages) instead of adding more browser sources. Each source runs its own copy of the
      browser engine.

---

## Low impact / housekeeping
- [ ] Delete `frontend/Assets/gameProper/image.png`. It is a 9.6 MB, 3840×2162 image that no
      HTML, JS or CSS uses. It adds to deploy size, not to rendering cost.
- [ ] Shrink player photos in `frontend/js/playerPhotos.js:14-16` from 1000px / WebP 0.92 to
      about 600px / 0.85. That is plenty for the slot size, and it makes the localStorage and
      WebSocket data (and image decoding) smaller.
- [ ] `frontend/css/heroStats.css:17` uses `backdrop-filter` on the stats pop-up. It only
      shows for about 4 s per lock, so it's fine, but don't use `backdrop-filter` on anything
      that stays on screen.

---

## Checking each fix
1. Open `display.html?room=test` in Chrome next to `controller.html?room=test`.
2. DevTools → Rendering → turn on **Paint flashing** and **Frame Rendering Stats**.
3. Start the draft and let a pick phase run. After the fixes, green paint flashes should only
   appear when something changes (a lock-in, a phase change), not all the time on the
   active slot, bans or timer.
4. Record about 10 s in the Performance panel before and after. Compare the time spent in
   "Paint" and "Rasterize", and the idle time on the main thread.
5. Check every animation by eye against the current version: the intro, active pick, ban
   glow, lock-in flash, portrait float and glow, and the timer warning pulse.
6. Run the existing tests: `node --test frontend/tests/`.
