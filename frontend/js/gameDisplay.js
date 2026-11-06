// In-game overlay (gameDisplay.html). Listens on all three sync channels:
// localStorage (restore on load + `storage` events), BroadcastChannel "team_channel",
// and the WebSocket room. Control side lives in js/ingame.js + js/control.js.
import { onMessage } from "./websocketClient.js";
import { mountSponsorSlideshow } from "./sponsorSlideshow.js?v=3";
import {
  playIntro, wipeSwap, revealPanel, concealPanel, swapIcon, scoreChanged, playSwitch,
} from "./gameDisplayAnim.js?v=1";

const MAX_WINS = 3;
const MAP_LABELS = {
  "healing-turtle": "HEALING TURTLE",
  "revealing-wisps": "REVEALING WISPS",
  "golden-turret": "GOLDEN TURRET",
  "flying-cloud": "FLYING CLOUD",
};

const $ = (id) => document.getElementById(id);

// ---------- Fit the 1920x1080 stage to the window ----------

function fitStage() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  $("stage").style.transform = `scale(${scale})`;
}
window.addEventListener("resize", fitStage);
fitStage();

// ---------- Animated updates ----------
// Before `ready` (restoring from localStorage on load) values are applied directly;
// the intro animates them in. After that, changes animate (js/gameDisplayAnim.js).
let ready = false;
let switching = false;

// Team names and casters arrive on every keystroke, so text changes are debounced
// and serialized per key: one animation runs once typing pauses, and only the
// latest value is shown.
const TYPING_PAUSE_MS = 350;
const pending = {};
const timers = {};
const busy = {};

function queue(key, task, delay = TYPING_PAUSE_MS) {
  pending[key] = task;
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => drain(key), delay);
}

async function drain(key) {
  if (busy[key] || !pending[key]) return; // a running task re-drains when it ends
  const task = pending[key];
  pending[key] = null;
  busy[key] = true;
  try {
    await task();
  } finally {
    busy[key] = false;
  }
  if (pending[key]) drain(key);
}

// ---------- Setters ----------

// Team names must always show in full on one line in the space before the pips.
// First squeeze horizontally (design default 82%, down to 70%), then shrink the font.
const NAME_FONT_PX = 39;
const NAME_SPACE_PX = 104; // plate padding to the first pip
const NAME_SQUEEZE = 0.82;
const NAME_SQUEEZE_MIN = 0.7;
const measureCtx = document.createElement("canvas").getContext("2d");

function fitName(el) {
  measureCtx.font = `${NAME_FONT_PX}px Anton`;
  const natural = measureCtx.measureText(el.textContent).width;
  let squeeze = NAME_SQUEEZE;
  let fontPx = NAME_FONT_PX;
  if (natural * squeeze > NAME_SPACE_PX) {
    squeeze = Math.max(NAME_SQUEEZE_MIN, NAME_SPACE_PX / natural);
    if (natural * squeeze > NAME_SPACE_PX) fontPx = NAME_FONT_PX * NAME_SPACE_PX / (natural * squeeze);
  }
  el.style.transform = `scaleX(${squeeze})`;
  el.style.fontSize = `${fontPx}px`;
}

const wantedName = { blue: "TEAM", red: "TEAM" };

function applyName(side) {
  const el = $(`${side}-name`);
  el.textContent = wantedName[side];
  fitName(el);
}

function setTeamName(side, name) {
  wantedName[side] = (name || "").trim() || "TEAM";
  if (!ready) return applyName(side);
  if (switching) return; // the switch animation applies the latest names
  queue(`${side}-name`, async () => {
    if ($(`${side}-name`).textContent === wantedName[side]) return;
    await wipeSwap($(`${side}-name`), side === "blue" ? "left" : "right", () => applyName(side));
  });
}

// SWITCH TEAMS: plates fold in, names change, plates unfold
async function switchTeams(blueName, redName) {
  if (blueName !== undefined) wantedName.blue = (blueName || "").trim() || "TEAM";
  if (redName !== undefined) wantedName.red = (redName || "").trim() || "TEAM";
  if (!ready) {
    applyName("blue");
    applyName("red");
    return;
  }
  if (switching) return; // same message via BroadcastChannel + WebSocket
  switching = true;
  ["blue", "red"].forEach((side) => {
    clearTimeout(timers[`${side}-name`]);
    pending[`${side}-name`] = null;
  });
  try {
    await playSwitch(() => {
      applyName("blue");
      applyName("red");
    });
  } finally {
    switching = false;
  }
  // a name that changed again while switching animates normally
  ["blue", "red"].forEach((side) => {
    if ($(`${side}-name`).textContent !== wantedName[side]) setTeamName(side, wantedName[side]);
  });
}

// re-fit once Anton has loaded (measurements before that use the fallback font)
document.fonts.load(`${NAME_FONT_PX}px Anton`).then(() => {
  fitName($("blue-name"));
  fitName($("red-name"));
});

const shownScore = { blue: 0, red: 0 };

function setScore(side, value) {
  const score = Math.max(0, parseInt(value, 10) || 0);
  const prev = shownScore[side];
  shownScore[side] = score;
  $(`${side}-score`).textContent = score;
  const pips = [...$(`${side}-pips`).children];
  // fill outward from the team name: blue left-to-right, red right-to-left
  if (side === "red") pips.reverse();
  pips.forEach((pip, i) => pip.classList.toggle("won", i < Math.min(score, MAX_WINS)));

  // the same update can arrive several times (BroadcastChannel, WebSocket, storage)
  if (!ready || score === prev) return;
  const newPips = score > prev ? pips.slice(Math.min(prev, MAX_WINS), Math.min(score, MAX_WINS)) : [];
  scoreChanged($(`${side}-score`), newPips, score > prev);
}

function applyCasters(value) {
  $("casters-text").textContent = value;
  $("casters-bar").hidden = !value;
}

function applyMapType(slug) {
  const label = MAP_LABELS[slug] || "";
  $("map-type-text").textContent = label;
  $("map-type-panel").hidden = !label;
  // icon file per map, e.g. Assets/gameProper/maps/flying-cloud.png (img hides itself if missing)
  const img = $("map-type-img");
  img.hidden = true;
  if (label) img.src = `Assets/gameProper/maps/${slug}.png`;
  else img.removeAttribute("src");
}

// A panel (casters bar / map panel): slides in when it gets a value, slides out
// when cleared, and swaps its content in place when the value changes.
async function updatePanel(panel, hasValue, isSame, apply, swapContent) {
  if (hasValue && panel.hidden) {
    apply();
    await revealPanel(panel);
  } else if (!hasValue && !panel.hidden) {
    const a = await concealPanel(panel);
    apply();
    a?.cancel();
  } else if (hasValue && !isSame()) {
    await swapContent();
  }
}

function setCasters(text) {
  const value = (text || "").trim();
  if (!ready) return applyCasters(value);
  queue("casters", () => updatePanel(
    $("casters-bar"),
    !!value,
    () => $("casters-text").textContent === value,
    () => applyCasters(value),
    () => wipeSwap($("casters-text"), "left", () => applyCasters(value)),
  ));
}

function setMapType(slug) {
  const label = MAP_LABELS[slug] || "";
  if (!ready) return applyMapType(slug);
  // a dropdown, not typing: no need to wait
  queue("map-type", () => updatePanel(
    $("map-type-panel"),
    !!label,
    () => $("map-type-text").textContent === label,
    () => applyMapType(slug),
    async () => {
      let applied = false;
      const applyOnce = () => { if (!applied) { applied = true; applyMapType(slug); } };
      await Promise.all([
        wipeSwap($("map-type-text"), "left", applyOnce),
        swapIcon(document.querySelector(".map-type-icon"), applyOnce),
      ]);
    },
  ), 0);
}

function resetAll() {
  setTeamName("blue", "");
  setTeamName("red", "");
  setScore("blue", 0);
  setScore("red", 0);
  setCasters("");
  setMapType("");
}

// ---------- Restore from localStorage ----------

function loadFromStorage() {
  const ls = (k) => localStorage.getItem(k);
  setTeamName("blue", ls("blue-team-name"));
  setTeamName("red", ls("red-team-name"));
  setScore("blue", ls("blue-score"));
  setScore("red", ls("red-score"));
  setCasters(ls("casters"));
  setMapType(ls("map-type"));
}

// ---------- Messages (BroadcastChannel + WebSocket) ----------

function handleMessage(data) {
  if (!data || typeof data !== "object") return;

  switch (data.type) {
    case "reset":
      resetAll();
      return;
    case "switch":
      switchTeams(data.blueTeamName, data.redTeamName);
      return;
    case "score-update":
      if (data.team === "blue" || data.team === "red") setScore(data.team, data.value);
      return;
    case "clear-scores":
      setScore("blue", 0);
      setScore("red", 0);
      return;
    case "casters":
      setCasters(data.value);
      return;
    case "map-type":
      setMapType(data.value);
      return;
  }

  // older untyped messages from control.js
  if (data.blueTeamName !== undefined) setTeamName("blue", data.blueTeamName);
  if (data.redTeamName !== undefined) setTeamName("red", data.redTeamName);
}

// ---------- Storage events (controller in another tab of this browser) ----------

function handleStorage(e) {
  if (e.key === null) return resetAll(); // localStorage.clear() from RESET DRAFT
  const v = e.newValue;
  switch (e.key) {
    case "blue-team-name": return setTeamName("blue", v);
    case "red-team-name": return setTeamName("red", v);
    case "blue-score": return setScore("blue", v);
    case "red-score": return setScore("red", v);
    case "casters": return setCasters(v);
    case "map-type": return setMapType(v);
  }
}

loadFromStorage();
mountSponsorSlideshow($("sponsors")); // handles its own storage/messages
let lastIntro = performance.now();
playIntro();
ready = true;

// Replay the intro whenever OBS puts this browser source on the program output
// (switching to a scene that contains it). OBS fires `obsSourceActiveChanged` on
// window; outside OBS this never fires. Skips a replay right after one already
// played (e.g. the page just loaded because the scene became active).
window.addEventListener("obsSourceActiveChanged", (e) => {
  if (!e.detail?.active) return;
  if (performance.now() - lastIntro < 1500) return;
  lastIntro = performance.now();
  playIntro();
});

const channel = new BroadcastChannel("team_channel");
channel.onmessage = (event) => handleMessage(event.data);
onMessage(handleMessage);
window.addEventListener("storage", handleStorage);
