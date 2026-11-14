// Caster cams screen (cams.html). The cams themselves are js/casterCamsDisplay.js;
// this file scales the stage, mounts the sponsor strip and shows the next match.
// Reached from the draft source with SHOW CAMS, or used as its own OBS source.
//
// Match card: rotates through the WAITING schedule (localStorage "waiting-schedule",
// message { type: "waiting-schedule", matches }); see "Match card rotation" below.
//
// On connect it sends { type: "waiting-request" } (js/waitingController.js resends the
// schedule) and { type: "cams-request" } (js/casterCams.js and js/sponsors.js resend
// the cams and the sponsor logos), so an OBS on another PC gets the current state.
import { matchLost } from "./matchResult.js";
import { onMessage, send } from "./websocketClient.js";
import { mountSponsorStrip } from "./sponsorStrip.js";
import { followSwitch } from "./overlayChain.js?v=2";
import { applyGrain } from "./grain.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage");

function fitStage() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener("resize", fitStage);
fitStage();
applyGrain(stage); // texture on the match card, as on waiting.html

// the cams grow into the space when the strip or the match card is hidden (css)
mountSponsorStrip($("cams-sponsors"), {
  onChange: (shown) => stage.classList.toggle("has-strip", shown),
});

// ---------- Match card rotation ----------
// NEXT MATCH (10 s) -> PREVIOUS MATCH (5 s) -> every filled-in schedule row in order
// (5 s each) -> the STAGE text from WAITING > SCREEN TEXT (5 s, skipped when blank;
// localStorage "waiting-info".stage, message { type: "waiting-info", info }) -> back to
// NEXT MATCH. Played rows (any score) show the score instead of VS. Rows without both
// teams are skipped; with no usable rows the card hides.
// Schedule edits re-render the current slide in place; the rotation keeps going.

const FIRST_MS = 10000;
const STEP_MS = 5000;
const OUT_MS = 260; // swipe out (accelerates from the first frame)
const IN_MS = 380;  // swipe in (decelerates into place)
const STAGGER_MS = 30;

const hasTeam = (t) => !!((t?.tag || "").trim() || (t?.name || "").trim());
const filled = (m) => hasTeam(m?.a) && hasTeam(m?.b);
const played = (m) => !!(Number(m?.a?.score) || 0) || !!(Number(m?.b?.score) || 0);

let matches = [];
let stageText = ""; // WAITING > SCREEN TEXT > stage
let slides = []; // [{ row, label, ms, stage? }]
let pos = -1;    // index into slides
let timer = null;
const card = $("next-match");

function readSchedule() {
  try {
    const list = JSON.parse(localStorage.getItem("waiting-schedule") || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function readStage() {
  try {
    return (JSON.parse(localStorage.getItem("waiting-info") || "{}") || {}).stage || "";
  } catch (e) {
    return "";
  }
}

function buildSlides() {
  const rows = matches.map((m, row) => ({ m, row })).filter(({ m }) => filled(m));
  const next = rows.find(({ m }) => !played(m));
  const prev = [...rows].reverse().find(({ m }) => played(m));
  const label = ({ m, row }) =>
    row === next?.row ? "NEXT MATCH" : row === prev?.row ? "PREVIOUS MATCH" : played(m) ? "RESULT" : "UPCOMING";
  const out = [];
  if (next) out.push({ row: next.row, label: "NEXT MATCH", ms: FIRST_MS });
  if (prev) out.push({ row: prev.row, label: "PREVIOUS MATCH", ms: STEP_MS });
  rows.forEach((r) => out.push({ row: r.row, label: label(r), ms: STEP_MS }));
  if (out.length && oneLine(stageText)) out.push({ row: -1, label: "", ms: STEP_MS, stage: true });
  if (out.length) out[0].ms = FIRST_MS; // whatever opens the loop gets the long slot
  return out;
}

function fillCard({ row, label, stage }) {
  const m = matches[row] || {};
  card.querySelector(".next-label-text").textContent = label;
  // stage slide: the stage words replace the teams, always on one line (typed line
  // breaks become spaces) and shrunk to fit the width
  card.classList.toggle("is-stage", !!stage);
  const stageEl = card.querySelector(".next-stage");
  stageEl.textContent = stage ? oneLine(stageText) : "";
  if (stage) fitWidth(stageEl, 32);
  ["a", "b"].forEach((side) => {
    const t = m[side] || {};
    const team = card.querySelector(`.next-team.${side}`);
    team.classList.toggle("lost", matchLost(m, side)); // only once decided (js/matchResult.js)
    const tag = (t.tag || "").trim();
    const name = (t.name || "").trim();
    // the tag is the big line; with no tag the name takes its place
    team.querySelector(".next-tag").textContent = tag || name;
    team.querySelector(".next-name").textContent = tag ? name : "";
    const img = team.querySelector("img");
    img.hidden = !t.logo;
    if (t.logo) img.src = t.logo;
    else img.removeAttribute("src");
  });
  const isPlayed = played(m);
  card.classList.toggle("is-result", isPlayed);
  card.querySelector(".next-vs").textContent = isPlayed
    ? `${Number(m.a?.score) || 0} - ${Number(m.b?.score) || 0}`
    : "VS";
  const info = [m.time, m.format].map((s) => (s || "").trim()).filter(Boolean).join(" · ");
  card.querySelector(".next-info").textContent = info;
  markListRow(row);
}

// ---------- Match list (right 1/3): every filled-in row, the one on the left marked ----------

const listBox = $("match-list-rows");
const listTemplate = $("list-row-template");

function renderList() {
  listBox.innerHTML = "";
  matches.forEach((m, row) => {
    if (!filled(m)) return;
    const node = listTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.row = String(row);
    ["a", "b"].forEach((side) => {
      const t = m[side] || {};
      const team = node.querySelector(`.list-team.${side}`);
      team.classList.toggle("lost", matchLost(m, side)); // only once decided (js/matchResult.js)
      team.querySelector(".list-tag").textContent = (t.tag || "").trim() || (t.name || "").trim();
      const img = team.querySelector("img");
      if (t.logo) {
        img.src = t.logo;
        img.hidden = false;
      }
    });
    const isPlayed = played(m);
    node.classList.toggle("is-result", isPlayed);
    node.querySelector(".list-mid").textContent = isPlayed
      ? `${Number(m.a?.score) || 0} - ${Number(m.b?.score) || 0}`
      : (m.time || "").trim() || "VS";
    listBox.appendChild(node);
  });
  markListRow(slides[pos]?.row);
}

function markListRow(row) {
  listBox.querySelectorAll(".list-row").forEach((el) => {
    el.classList.toggle("current", el.dataset.row === String(row));
  });
}

// Swipe up: the label and the row contents slide up out of the card, the new ones slide
// up in from below. The card frame stays; .next-label and .next-row clip their contents
// (overflow hidden), so nothing fades: OBS shows half-transparent panels as grey.
function wipeTo(slide) {
  // the MATCHES list swipes too, so it can leave for the stage slide and come back after
  // Only parts on screen take part (hidden ones would add empty stagger time), in
  // reading order: label, team A, middle, team B, then the list.
  const main = card.querySelector(".next-main");
  const list = card.querySelector(".match-list");
  const visibleParts = () => [main.querySelector(".next-label-text"), ...main.querySelector(".next-row").children,
    list.querySelector(".list-label"), list.querySelector(".list-rows")]
    .filter((el) => el.getClientRects().length);
  const run = (parts, keyframes, duration, easing) =>
    parts.map((el, i) => el.animate(keyframes, { duration, easing, delay: i * STAGGER_MS, fill: "both" }));

  const outs = run(visibleParts(),
    [{ transform: "translateY(0)" }, { transform: "translateY(-120%)" }],
    OUT_MS, "cubic-bezier(0.4, 0, 1, 1)");
  Promise.all(outs.map((a) => a.finished)).then(() => {
    fillCard(slides[pos] || slide); // latest data if the schedule changed mid-swipe
    outs.forEach((a) => a.cancel());
    // the stage slide shows different parts than a match slide, so pick them again
    run(visibleParts(),
      [{ transform: "translateY(120%)" }, { transform: "translateY(0)" }],
      IN_MS, "cubic-bezier(0, 0, 0.2, 1)")
      .forEach((a) => a.finished.then(() => a.cancel(), () => {}));
  }, () => {});
}

function schedule() {
  clearTimeout(timer);
  timer = slides.length > 1 ? setTimeout(advance, slides[pos].ms) : null;
}

function advance() {
  slides = buildSlides();
  if (!slides.length) return setMatches(matches);
  pos = (pos + 1) % slides.length;
  wipeTo(slides[pos]);
  schedule();
}

function setMatches(list) {
  matches = Array.isArray(list) ? list : [];
  const before = slides[pos];
  slides = buildSlides();
  stage.classList.toggle("has-match", slides.length > 0);
  renderList();

  if (!slides.length) {
    clearTimeout(timer);
    timer = null;
    pos = -1;
    card.hidden = true;
    return;
  }
  if (card.hidden || pos < 0) {
    // card (re)appears: start the loop at its first slide (the css entrance plays)
    card.hidden = false;
    pos = 0;
    fillCard(slides[0]);
    schedule();
    return;
  }
  // an edit while showing: keep the same row on screen if it's still in the loop
  const same = slides.findIndex((s) => s.row === before?.row && s.label === before?.label);
  const keep = same >= 0 ? same : slides.findIndex((s) => s.row === before?.row);
  pos = keep >= 0 ? keep : Math.min(pos, slides.length - 1);
  fillCard(slides[pos]);
  if (keep < 0 || !timer) schedule();
}

const oneLine = (text) => (text || "").replace(/\s*\n\s*/g, " ").trim();

// shrink a one-line element's font until it fits its box (css sets the largest size)
function fitWidth(el, minPx) {
  el.style.fontSize = "";
  let px = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth && px > minPx) {
    px -= 2;
    el.style.fontSize = `${px}px`;
  }
}

function setStage(text) {
  stageText = typeof text === "string" ? text : "";
  if (matches.length) setMatches(matches); // add / drop / refresh the stage slide
}

// ---------- Out transition (before SHOW DRAFT / HEROES / INGAME leaves this page) ----------
// The reverse of the css entrances: strip up and out, cams wiped down (one after the
// other), scoreboard down and out. Slides and wipes only, no opacity: OBS shows
// half-transparent panels as grey on a transparent source.
let leaving = false;

function playOutro(done) {
  if (leaving) return; // the same message arrives over BroadcastChannel and WebSocket
  leaving = true;
  clearTimeout(timer); // no more slide changes
  const EASE = "cubic-bezier(0.4, 0, 1, 1)";
  let end = 0;
  const run = (el, keyframes, delay, duration) => {
    if (!el || !el.getClientRects().length) return; // hidden: nothing to animate
    el.getAnimations().forEach((a) => a.cancel()); // stop the entrance if it's still running
    el.animate(keyframes, { duration, delay, easing: EASE, fill: "forwards" });
    end = Math.max(end, delay + duration);
  };
  run($("next-match"), [{ transform: "none" }, { transform: "translateY(calc(100% + 40px))" }], 0, 420);
  document.querySelectorAll(".caster-cam").forEach((cam, i) =>
    run(cam, [{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 100% 0)" }], 80 + i * 90, 420));
  run($("cams-sponsors"), [{ transform: "none" }, { transform: "translateY(-100%)" }], 160, 380);
  setTimeout(done, end + 60);
}

function handleMessage(data) {
  if (data?.type === "waiting-schedule") setMatches(data.matches);
  else if (data?.type === "waiting-info") setStage(data.info?.stage);
  // SHOW DRAFT / HEROES / INGAME: only when this tab is the draft source, not a
  // standalone cams source (js/overlayChain.js)
  else followSwitch(data?.type, "cams.html", playOutro);
}

stageText = readStage();
setMatches(readSchedule());

const channel = new BroadcastChannel("team_channel");
channel.addEventListener("message", (e) => handleMessage(e.data));
onMessage(handleMessage);
window.addEventListener("storage", (e) => {
  if (e.key === null || e.key === "waiting-schedule") setMatches(readSchedule());
  if (e.key === null || e.key === "waiting-info") setStage(readStage());
});

// Ask the controller for its current state once the socket is up. send() returns
// false until the socket is open; give up after ~10 s (no relay = same browser only).
let asks = 0;
const ask = setInterval(() => {
  if (send({ type: "waiting-request" })) {
    send({ type: "cams-request" });
    clearInterval(ask);
  } else if (++asks > 20) clearInterval(ask);
}, 500);
