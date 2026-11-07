// Display side of the draft hero stats (display.html).
// On a real lock-in (the "hero-locked" event from js/hero.js), the pick slot turns gold and shows
// PICK / CONTENTION RATE / WIN RATE for the active tournament for a few seconds, then wipes away.
// Stats are preloaded, so a lock-in never waits on the network. If they aren't available
// (offline, no active tournament), the pick renders exactly as before, with no overlay.
//
// Intro: the gold tint wipes down, each label slides up and each number pops in (staggered),
// and the numbers count up from 0. Outro: everything wipes back up.
// Same rule as js/gameDisplayAnim.js: no opacity fades (OBS greys semi-transparent pixels);
// motion uses clip-path, translate and scale only.
import { onMessage } from "./websocketClient.js";
import { aggregate, heroStatLine } from "./heroStatsCore.js";
import * as api from "./heroStatsApi.js";

const SHOW_DELAY_MS = 900;   // let the hero wipe-in land first
const HOLD_MS = 4000;        // how long the stats stay up once the intro finishes
const REFRESH_MS = 60000;    // safety refetch in case a change message was missed

const OUT = "cubic-bezier(0.22, 1, 0.36, 1)";   // fast start, soft landing
const IN = "cubic-bezier(0.55, 0, 0.75, 0.2)";  // soft start, fast exit
const POP = "cubic-bezier(0.34, 1.56, 0.64, 1)"; // slight overshoot
// Broadcast overlay: always animate. The OS "reduce motion" setting belongs to the
// operator's machine (and OBS picks it up), but the audience is the stream viewers.
const REDUCED = false;

const TINT_MS = 450;         // tint wipe down
const ROW_START_MS = 200;    // first row starts while the tint is still wiping
const ROW_STAGGER_MS = 140;  // gap between PICK, CONTENTION RATE, WIN RATE
const COUNT_MS = 700;        // number count-up
const OUTRO_MS = 400;

const HIDDEN = "inset(0 0 100% 0)"; // collapsed onto the top edge
const SHOWN = "inset(0 0 0% 0)";

function anim(el, keyframes, { duration, delay = 0, easing = OUT }) {
  return el.animate(keyframes, { duration: REDUCED ? 0 : duration, delay: REDUCED ? 0 : delay, easing, fill: "both" });
}

// "75%" counts 0% → 75%, "4" counts 0 → 4; anything else ("—") is left as is.
function countUp(el, finalText, delay) {
  const m = /^(\d+)(%?)$/.exec(finalText);
  if (!m || REDUCED) { el.textContent = finalText; return; }
  const target = parseInt(m[1], 10);
  const suffix = m[2];
  el.textContent = `0${suffix}`;
  setTimeout(() => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = `${Math.round(target * eased)}${suffix}`;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, delay);
}

// Returns how long the intro takes, so the hold starts after it.
function playIntro(el) {
  anim(el, [{ clipPath: HIDDEN }, { clipPath: SHOWN }], { duration: TINT_MS });
  const labels = [...el.querySelectorAll(".hero-stats-label")];
  const values = [...el.querySelectorAll(".hero-stats-value")];
  labels.forEach((label, i) => {
    const delay = ROW_START_MS + i * ROW_STAGGER_MS;
    anim(label, [{ translate: "0 14px", clipPath: "inset(100% 0 0 0)" }, { translate: "0 0", clipPath: "inset(0 0 0 0)" }], { duration: 360, delay });
    anim(values[i], [{ scale: "0" }, { scale: "1" }], { duration: 520, delay: delay + 80, easing: POP });
    countUp(values[i], values[i].dataset.final, delay + 80);
  });
  return REDUCED ? 0 : ROW_START_MS + (labels.length - 1) * ROW_STAGGER_MS + 80 + COUNT_MS;
}

function playOutro(el) {
  return anim(el, [{ clipPath: SHOWN }, { clipPath: HIDDEN }], { duration: OUTRO_MS, easing: IN }).finished.catch(() => {});
}
const DEDUPE_MS = 2500;      // same lock-in can arrive via storage event and WebSocket

let agg = null;              // { totalGames, byHero } for the active tournament, or null
let loading = null;

async function load() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const id = await api.getActiveTournamentId();
      agg = id ? aggregate(await api.listGames(id)) : null;
    } catch (e) {
      console.warn("[heroStats] stats unavailable:", e.message);
      // keep the last good stats if we had them
    } finally {
      loading = null;
    }
  })();
  return loading;
}

const lastShown = new Map(); // slot → { name, at }

function build(stats) {
  const el = document.createElement("div");
  el.className = "hero-stats";
  const inner = document.createElement("div");
  inner.className = "hero-stats-inner";
  const rows = [["PICK", stats.pick], ["CONTENTION RATE", stats.contention], ["WIN RATE", stats.winRate]];
  for (const [label, value] of rows) {
    const l = document.createElement("div");
    l.className = "hero-stats-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "hero-stats-value";
    v.dataset.final = value;
    v.textContent = value;
    inner.append(l, v);
  }
  el.appendChild(inner);
  return el;
}

document.addEventListener("hero-locked", (e) => {
  const { slot, name, container } = e.detail;
  if (!agg || !container) return;

  const prev = lastShown.get(slot);
  const now = Date.now();
  if (prev && prev.name === name && now - prev.at < DEDUPE_MS) return;
  lastShown.set(slot, { name, at: now });

  const stats = heroStatLine(agg, name);
  setTimeout(() => {
    // Slot was cleared or changed to another hero meanwhile
    if (!container.querySelector(`img[alt="${CSS.escape(name)}"]`)) return;
    container.querySelectorAll(".hero-stats").forEach((n) => n.remove());
    const el = build(stats);
    container.appendChild(el);
    const introMs = playIntro(el);
    setTimeout(async () => {
      if (!el.isConnected) return;
      await playOutro(el);
      el.remove();
    }, introMs + HOLD_MS);
  }, SHOW_DELAY_MS);
});

function onAny(data) {
  if (data && data.type === "tournament-stats-changed") load();
}
new BroadcastChannel("team_channel").addEventListener("message", (e) => onAny(e.data));
onMessage(onAny);
setInterval(load, REFRESH_MS);
load();
