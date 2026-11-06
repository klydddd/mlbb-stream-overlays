// INGAME tab controls (controller.html, mode "ingame" in panels.js).
// Every control syncs over all three channels (localStorage, BroadcastChannel, WebSocket),
// except the one-shot triggers, which aren't stored because they don't persist.
//
// Messages sent:
//   { type: "score-update", team: "blue"|"red", value }  localStorage: blue-score / red-score
//   { type: "casters", value }                           localStorage: casters
//   { type: "map-type", value }                          localStorage: map-type
//   { type: "ingame-cam", value }                        localStorage: ingame-cam
//       value: "player-1".."player-5" | "team" | ""  (one cam view at a time, "" = off)
//   { type: "ingame-event", event, at }                  one-shot, not stored
//       event: "turtle" | "lord" | "replay" | "item-check"
import { send } from "./websocketClient.js";

const channel = new BroadcastChannel("team_channel");

function broadcast(msg) {
  channel.postMessage(msg);
  send(msg);
}

function store(key, value) {
  if (value === "" || value === null || value === undefined) localStorage.removeItem(key);
  else localStorage.setItem(key, String(value));
}

// ---------- Scores ----------

function getScore(team) {
  return Math.max(0, parseInt(localStorage.getItem(`${team}-score`), 10) || 0);
}

function setScore(team, value) {
  const v = Math.max(0, value);
  store(`${team}-score`, v);
  broadcast({ type: "score-update", team, value: v });
  renderScores();
}

function renderScores() {
  ["blue", "red"].forEach((team) => {
    document.querySelectorAll(`[data-score-value="${team}"]`).forEach((el) => {
      el.textContent = getScore(team);
    });
  });
  document.querySelectorAll("[data-score-team-name]").forEach((el) => {
    const input = document.getElementById(el.dataset.scoreTeamName);
    const name = input ? input.value.trim() : "";
    el.textContent = name || (el.dataset.scoreTeamName === "blueTeamName" ? "BLUE" : "RED");
  });
}

// Covers the INGAME buttons and the ADD/DEDUCT buttons in TEAM INFO
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-score-team][data-score-delta]");
  if (!btn) return;
  const team = btn.dataset.scoreTeam;
  setScore(team, getScore(team) + parseInt(btn.dataset.scoreDelta, 10));
});

// SWITCH TEAMS: the score follows the team to its new side
document.getElementById("switch")?.addEventListener("click", () => {
  const blue = getScore("blue");
  const red = getScore("red");
  setScore("blue", red);
  setScore("red", blue);
});

// ---------- Casters ----------

const castersInput = document.getElementById("casters-input");
if (castersInput) {
  castersInput.value = localStorage.getItem("casters") || "";
  castersInput.addEventListener("input", () => {
    const value = castersInput.value;
    store("casters", value);
    broadcast({ type: "casters", value });
  });
}

// ---------- Map type ----------

const mapSelect = document.getElementById("map-type-select");
if (mapSelect) {
  mapSelect.value = localStorage.getItem("map-type") || "";
  mapSelect.addEventListener("change", () => {
    const value = mapSelect.value;
    store("map-type", value);
    broadcast({ type: "map-type", value });
  });
}

// ---------- Cams (toggles, one active at a time) ----------

function renderCams() {
  const active = localStorage.getItem("ingame-cam") || "";
  document.querySelectorAll("[data-ingame-cam]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.ingameCam === active));
  });
}

function setCam(value) {
  store("ingame-cam", value);
  broadcast({ type: "ingame-cam", value });
  renderCams();
}

document.querySelectorAll("[data-ingame-cam]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const active = localStorage.getItem("ingame-cam") || "";
    setCam(active === btn.dataset.ingameCam ? "" : btn.dataset.ingameCam);
  });
});

document.getElementById("ingame-cams-off")?.addEventListener("click", () => setCam(""));

// ---------- One-shot triggers ----------

document.querySelectorAll("[data-ingame-event]").forEach((btn) => {
  btn.addEventListener("click", () => {
    broadcast({ type: "ingame-event", event: btn.dataset.ingameEvent, at: Date.now() });
    // brief "sent" flash so the operator knows the click registered
    btn.classList.remove("fired");
    void btn.offsetWidth;
    btn.classList.add("fired");
  });
  btn.addEventListener("animationend", () => btn.classList.remove("fired"));
});

// ---------- Re-render after other controls change shared state ----------

function renderAll() {
  renderScores();
  renderCams();
  if (castersInput) castersInput.value = localStorage.getItem("casters") || "";
  if (mapSelect) mapSelect.value = localStorage.getItem("map-type") || "";
}

// CLEAR SCORES and RESET DRAFT run their handlers (clear.js / control.js) first
document.getElementById("clear-scores")?.addEventListener("click", renderScores);
document.getElementById("reset")?.addEventListener("click", renderAll);

// Team names show next to the score counters
["blueTeamName", "redTeamName"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", renderScores);
});

// Another controller tab in the same browser
window.addEventListener("storage", (e) => {
  if (e.key === null || ["blue-score", "red-score", "casters", "map-type", "ingame-cam",
    "blue-team-name", "red-team-name"].includes(e.key)) {
    renderAll();
  }
});

renderAll();
