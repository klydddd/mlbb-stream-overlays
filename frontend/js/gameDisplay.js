// In-game overlay (gameDisplay.html). Listens on all three sync channels:
// localStorage (restore on load + `storage` events), BroadcastChannel "team_channel",
// and the WebSocket room. Control side lives in js/ingame.js + js/control.js.
import { onMessage } from "./websocketClient.js";
import { mountSponsorSlideshow } from "./sponsorSlideshow.js?v=3";

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

function setTeamName(side, name) {
  const el = $(`${side}-name`);
  el.textContent = (name || "").trim() || "TEAM";
  fitName(el);
}

// re-fit once Anton has loaded (measurements before that use the fallback font)
document.fonts.load(`${NAME_FONT_PX}px Anton`).then(() => {
  fitName($("blue-name"));
  fitName($("red-name"));
});

function setScore(side, value) {
  const score = Math.max(0, parseInt(value, 10) || 0);
  $(`${side}-score`).textContent = score;
  const pips = [...$(`${side}-pips`).children];
  // fill outward from the team name: blue left-to-right, red right-to-left
  if (side === "red") pips.reverse();
  pips.forEach((pip, i) => pip.classList.toggle("won", i < Math.min(score, MAX_WINS)));
}

function setCasters(text) {
  const value = (text || "").trim();
  $("casters-text").textContent = value;
  $("casters-bar").hidden = !value;
}

function setMapType(slug) {
  const label = MAP_LABELS[slug] || "";
  $("map-type-text").textContent = label;
  $("map-type-panel").hidden = !label;
  // icon file per map, e.g. Assets/gameProper/maps/flying-cloud.png (img hides itself if missing)
  const img = $("map-type-img");
  img.hidden = true;
  if (label) img.src = `Assets/gameProper/maps/${slug}.png`;
  else img.removeAttribute("src");
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
      if (data.blueTeamName !== undefined) setTeamName("blue", data.blueTeamName);
      if (data.redTeamName !== undefined) setTeamName("red", data.redTeamName);
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

const channel = new BroadcastChannel("team_channel");
channel.onmessage = (event) => handleMessage(event.data);
onMessage(handleMessage);
window.addEventListener("storage", handleStorage);
