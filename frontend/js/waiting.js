// Waiting / break screen (waiting.html). Listens on all three sync channels:
// localStorage (restore on load + `storage` events), BroadcastChannel "team_channel",
// and the WebSocket room. Control side lives in js/waitingController.js.
//
// localStorage / messages:
//   "waiting-countdown"  { running, remaining, endsAt }   { type: "waiting-countdown", running, remaining }
//   "waiting-info"       { stage, event, region, ticker, video }   { type: "waiting-info", info }
//   "waiting-schedule"   [match]                         { type: "waiting-schedule", matches }
//     match: { a: {tag, name, logo, score}, b: {...}, time, format }
//   "waiting-logo"       dataUrl                         { type: "waiting-logo", logo }
// Over the WebSocket the countdown carries `remaining` (ms) and the end time is worked
// out on this machine, so clock differences between PCs don't matter.
// On connect this page sends { type: "waiting-request" } and the controller resends everything.
import { onMessage, send } from "./websocketClient.js";
import { mountSponsorStrip } from "./sponsorStrip.js";

const $ = (id) => document.getElementById(id);

function fitStage() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  $("stage").style.transform = `scale(${scale})`;
}
window.addEventListener("resize", fitStage);
fitStage();

// Film grain: a small tile of random grey speckles, faint enough to read as texture.
// Drawn once and used as a background on the panels (.grain) and the match rows.
(function makeGrain() {
  const size = 160;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.random() * 34;
  }
  ctx.putImageData(img, 0, 0);
  $("stage").style.setProperty("--grain", `url(${canvas.toDataURL()})`);
})();

function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch (e) {
    return fallback;
  }
}

// ---------- Countdown ----------

let countdown = { running: false, remaining: 0, endsAt: 0 };
const timeEl = $("countdown-time");

function setCountdown(c, fromRemote) {
  const running = !!c?.running;
  const remaining = Math.max(0, Number(c?.remaining) || 0);
  // localStorage carries the controller's endsAt (same machine); remote messages use remaining
  const endsAt = running ? (!fromRemote && c.endsAt ? Number(c.endsAt) : Date.now() + remaining) : 0;
  countdown = { running, remaining, endsAt };
  tick();
}

function msLeft() {
  return countdown.running ? Math.max(0, countdown.endsAt - Date.now()) : countdown.remaining;
}

function format(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function tick() {
  const left = msLeft();
  const text = format(left);
  if (timeEl.textContent !== text) timeEl.textContent = text;
  timeEl.classList.toggle("done", countdown.running && left === 0);
}
setInterval(tick, 200);

// ---------- Info (stage label, side texts, ticker, video) ----------

let info = {};
let matches = [];

function setInfo(next) {
  info = next && typeof next === "object" ? next : {};
  document.querySelectorAll("[data-info]").forEach((el) => {
    el.textContent = info[el.dataset.info] || "";
  });
  setVideo(info.video || "");
  renderTicker();
}

let currentVideo = null;
function setVideo(url) {
  if (url === currentVideo) return;
  currentVideo = url;
  const box = $("video-box");
  box.innerHTML = "";
  if (!url) return;
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(url)) {
    const v = document.createElement("video");
    Object.assign(v, { src: url, autoplay: true, loop: true, muted: true, playsInline: true });
    box.appendChild(v);
  } else {
    const f = document.createElement("iframe");
    f.src = url;
    f.allow = "autoplay; fullscreen";
    box.appendChild(f);
  }
}

// Ticker: the typed text, or (when blank) the results built from the schedule
function tickerText() {
  // the ticker is one line: typed line breaks become separators
  const typed = (info.ticker || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (typed.length) return typed.join("   •   ");
  const played = matches.filter((m) => (m.a?.tag || m.a?.name) && (m.b?.tag || m.b?.name));
  if (!played.length) return "";
  const side = (t) => `${t.tag || t.name} (${Number(t.score) || 0})`;
  const results = played.map((m) => `${side(m.a)} - ${side(m.b)}`).join("  |  ");
  const stage = (info.stage || "").replace(/\s*\n\s*/g, " ").trim();
  return `${stage ? stage + " " : ""}MATCH RESULTS: ${results}`;
}

function renderTicker() {
  const track = $("ticker-track");
  const text = tickerText();
  track.classList.remove("scroll");
  track.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = text;
  track.appendChild(span);
  const room = track.parentElement.clientWidth - 104; // ticker padding
  if (text && span.offsetWidth > room) {
    // loop: two copies, slide by one copy's width at ~90px/s
    track.appendChild(span.cloneNode(true));
    track.classList.add("scroll");
    track.style.setProperty("--ticker-duration", `${(span.offsetWidth + 120) / 90}s`);
  }
}

// ---------- Schedule ----------

const template = $("match-template");

// shrink a single-line element's font until it fits its box
function fitText(el, minPx) {
  el.style.fontSize = "";
  let px = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth && px > minPx) {
    px -= 1;
    el.style.fontSize = `${px}px`;
  }
}

// rows from index `fromIndex` on slide in (new rows only, not every keystroke)
function renderMatches(fromIndex = Infinity) {
  const box = $("matches");
  box.innerHTML = "";
  matches.slice(0, 4).forEach((m, i) => {
    const node = template.content.firstElementChild.cloneNode(true);
    ["a", "b"].forEach((side) => {
      const t = m[side] || {};
      const team = node.querySelector(`.team.${side}`);
      team.querySelector(".team-tag").textContent = t.tag || "";
      team.querySelector(".team-name").textContent = t.name || "";
      const img = team.querySelector("img");
      if (t.logo) {
        img.src = t.logo;
        img.hidden = false;
      }
    });
    node.querySelector(".match-time").textContent = m.time || "";
    node.querySelector(".match-format").textContent = m.format || "";
    if (i >= fromIndex) {
      node.classList.add("enter");
      node.style.animationDelay = `${i * 90}ms`;
    }
    box.appendChild(node);
  });
  box.querySelectorAll(".team-text").forEach((el) => {
    el.style.maxWidth = `${el.parentElement.clientWidth - 90}px`;
  });
  box.querySelectorAll(".team-tag").forEach((el) => {
    el.style.overflow = "hidden";
    fitText(el, 18);
  });
  renderTicker();
}

function setMatches(list) {
  const before = matches.length;
  matches = Array.isArray(list) ? list : [];
  renderMatches(before);
}

// ---------- Event logo ----------

function setLogo(src) {
  const img = $("event-logo");
  img.hidden = !src;
  if (src) img.src = src;
  else img.removeAttribute("src");
}

// ---------- Wiring ----------

function handleMessage(data) {
  if (!data || typeof data !== "object") return;
  if (data.type === "waiting-countdown") setCountdown(data, true);
  else if (data.type === "waiting-info") setInfo(data.info);
  else if (data.type === "waiting-schedule") setMatches(data.matches);
  else if (data.type === "waiting-logo") setLogo(data.logo || "");
}

function loadFromStorage() {
  setCountdown(readJSON("waiting-countdown", {}), false);
  setInfo(readJSON("waiting-info", {}));
  setMatches(readJSON("waiting-schedule", []));
  setLogo(localStorage.getItem("waiting-logo") || "");
}

loadFromStorage();
mountSponsorStrip($("waiting-sponsors"));

// re-fit once the fonts have loaded (Anton is much narrower than the fallback)
document.fonts?.ready.then(() => renderMatches());

const channel = new BroadcastChannel("team_channel");
channel.addEventListener("message", (e) => handleMessage(e.data));
onMessage(handleMessage);

window.addEventListener("storage", (e) => {
  if (e.key === null) loadFromStorage();
  else if (e.key === "waiting-countdown") setCountdown(readJSON("waiting-countdown", {}), false);
  else if (e.key === "waiting-info") setInfo(readJSON("waiting-info", {}));
  else if (e.key === "waiting-schedule") setMatches(readJSON("waiting-schedule", []));
  else if (e.key === "waiting-logo") setLogo(localStorage.getItem("waiting-logo") || "");
});

// Ask the controller for the current state once the socket is up (OBS on another PC
// has no localStorage of its own). send() returns false until the socket is open.
let asks = 0;
const ask = setInterval(() => {
  if (send({ type: "waiting-request" }) || ++asks > 20) clearInterval(ask);
}, 500);
