// heroesDisplay.js — drives heroes-display.html (full lineup screen).
// Listens to the same sources as display.js: localStorage, BroadcastChannel("team_channel") and WebSocket.

import { heroes } from "./hero.js";
import { onMessage } from "./websocketClient.js";

const ROLE_IMG = {
  EXP: "Assets/defaults/EXP.png",
  GOLD: "Assets/defaults/GOLD.png",
  JG: "Assets/defaults/JG.png",
  MID: "Assets/defaults/MID.png",
  ROAM: "Assets/defaults/ROAM.png",
};

// Column layout mirrors display.html: blue reads EXP→ROAM, red is mirrored ROAM→EXP.
// pick = heroPick slot (1-10), player = player-name slot (1-10).
const LAYOUT = {
  blue: [
    { pick: 1, player: 1, role: "EXP" },
    { pick: 4, player: 2, role: "GOLD" },
    { pick: 5, player: 3, role: "JG" },
    { pick: 8, player: 4, role: "MID" },
    { pick: 9, player: 5, role: "ROAM" },
  ],
  red: [
    { pick: 10, player: 10, role: "ROAM" },
    { pick: 7, player: 9, role: "MID" },
    { pick: 6, player: 8, role: "JG" },
    { pick: 3, player: 7, role: "GOLD" },
    { pick: 2, player: 6, role: "EXP" },
  ],
};

const MAX_WINS = 3;

const $ = (id) => document.getElementById(id);
const cardsByPick = {};   // pick slot -> card refs
const cardsByPlayer = {}; // player slot -> card refs

// ---------- Build cards ----------

function buildCards() {
  for (const side of ["blue", "red"]) {
    const wrap = $(`hd-cards-${side}`);
    LAYOUT[side].forEach(({ pick, player, role }) => {
      const card = document.createElement("div");
      card.className = "card";
      // Intro stagger order: outer edges first, converging on the center
      // (both teams animate at the same time, mirrored).
      const pos = LAYOUT[side].findIndex((c) => c.pick === pick); // 0..4, left to right
      card.style.setProperty("--i", side === "blue" ? pos : 4 - pos);
      card.innerHTML = `
        <div class="card-placeholder" style="background-image:url('${ROLE_IMG[role]}')"></div>
        <div class="card-art"></div>
        <div class="card-photo"></div>
        <div class="card-hero-name"></div>
        <div class="card-role"><span class="card-role-icon" style="background-image:url('${ROLE_IMG[role]}')"></span></div>
        <div class="card-player"></div>`;
      wrap.appendChild(card);

      const refs = {
        side,
        card,
        art: card.querySelector(".card-art"),
        heroName: card.querySelector(".card-hero-name"),
        photo: card.querySelector(".card-photo"),
        player: card.querySelector(".card-player"),
        current: "",
        timers: [],
      };
      cardsByPick[pick] = refs;
      cardsByPlayer[player] = refs;
    });
  }
}

// ---------- Updaters ----------

const GLOW = {
  blue: ["glow-blue-1", "glow-blue-2", "glow-blue-3"],
  red: ["glow-red-1", "glow-red-2", "glow-red-3"],
};

function stopAnimations(refs) {
  refs.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
  refs.timers = [];
}

// Same behaviour as hero.js: float + random glow after the reveal,
// plus a team-colored flash when the pick arrives live (not on page load).
function animatePick(refs, img, flash) {
  if (flash) {
    const cls = `${refs.side}-select`;
    refs.card.classList.remove(cls);
    void refs.card.offsetWidth; // restart the animation
    refs.card.classList.add(cls);
    refs.timers.push(setTimeout(() => refs.card.classList.remove(cls), 1000));
  }

  refs.timers.push(setTimeout(() => {
    img.classList.add("float");
    let currentGlow = "";
    refs.timers.push(setInterval(() => {
      if (currentGlow) img.classList.remove(currentGlow);
      const glows = GLOW[refs.side];
      const nextGlow = Math.random() > 0.4 ? glows[Math.floor(Math.random() * glows.length)] : "";
      if (nextGlow) img.classList.add(nextGlow);
      currentGlow = nextGlow;
    }, 2500 + Math.random() * 1500));
  }, 900));
}

function setPick(slot, heroName, flash = true) {
  const refs = cardsByPick[slot];
  if (!refs) return;

  const name = (heroName || "").trim();
  const hero = name ? heroes.find((h) => h.name.toLowerCase() === name.toLowerCase()) : null;
  const key = hero ? hero.name : "";
  if (refs.current === key) return; // avoid replaying the reveal animation
  refs.current = key;

  stopAnimations(refs);
  refs.art.innerHTML = "";
  refs.heroName.textContent = "";
  refs.card.classList.toggle("picked", !!hero);
  if (!hero) return;

  const img = document.createElement("img");
  img.src = hero.img;
  img.alt = hero.name;
  refs.art.appendChild(img);

  // Re-insert the name so its slide-in animation replays
  const nameEl = refs.heroName.cloneNode(false);
  nameEl.textContent = hero.name;
  refs.heroName.replaceWith(nameEl);
  refs.heroName = nameEl;

  animatePick(refs, img, flash);
}

function setPlayerName(slot, value) {
  const refs = cardsByPlayer[slot];
  if (refs) refs.player.textContent = value || `PLAYER ${slot}`;
}

// Player photo (cut-out) layered over the hero art, keyed by player slot.
function setPhoto(slot, data) {
  const refs = cardsByPlayer[slot];
  if (!refs) return;
  refs.photo.innerHTML = "";
  refs.card.classList.toggle("has-photo", !!data);
  if (!data) return;
  const img = document.createElement("img");
  img.src = data;
  img.alt = "";
  refs.photo.appendChild(img);
}

function clearPhotos() {
  for (let i = 1; i <= 10; i++) setPhoto(i, null);
}

function setText(ids, value) {
  ids.forEach((id) => {
    const el = $(id);
    if (el) el.textContent = value;
  });
}

const setBlueName = (v) => setText(["hd-blue-team-name"], v || "BLUE TEAM");
const setRedName = (v) => setText(["hd-red-team-name"], v || "RED TEAM");
const setRound = (v) => setText(["hd-round-name", "hd-ribbon-round"], v || "PLAYOFFS");
const setMatch = (v) => setText(["hd-match-number", "hd-ribbon-match"], v || "0");
const setGame = (v) => setText(["hd-game-number", "hd-ribbon-game"], v || "0");

function setLogo(side, data) {
  const box = $(`hd-logo-${side}`);
  if (!box) return;
  box.innerHTML = "";
  if (!data) return;
  const img = document.createElement("img");
  img.src = data;
  img.alt = "";
  box.appendChild(img);
}

// Reuses the "blue-score" / "red-score" localStorage keys that clear.js already resets.
function setScore(side, value) {
  const wins = Math.max(0, Math.min(MAX_WINS, parseInt(value, 10) || 0));
  document.querySelectorAll(`#hd-pips-${side} .pip`).forEach((pip, i) => {
    // Blue fills from the inside (next to the name), red mirrors it.
    const idx = side === "blue" ? i : MAX_WINS - 1 - i;
    pip.classList.toggle("won", idx < wins);
  });
}

// ---------- Clearers ----------

function clearNames() {
  for (let i = 1; i <= 10; i++) setPlayerName(i, "");
}

function clearPicks() {
  for (let i = 1; i <= 10; i++) setPick(i, "");
}

function clearScores() {
  setScore("blue", 0);
  setScore("red", 0);
}

// ---------- Initial state from localStorage ----------

function loadFromStorage() {
  const ls = (k) => localStorage.getItem(k);

  setBlueName(ls("blue-team-name"));
  setRedName(ls("red-team-name"));
  setRound(ls("round-name"));
  setMatch(ls("match-number"));
  setGame(ls("game-number"));
  setLogo("blue", ls("logo-blue"));
  setLogo("red", ls("logo-red"));
  setScore("blue", ls("blue-score"));
  setScore("red", ls("red-score"));

  for (let i = 1; i <= 10; i++) {
    setPlayerName(i, ls(`player-name-${i}`));
    setPhoto(i, ls(`player-photo-${i}`));
    setPick(i, ls(`heroPick-${i}`), false);
  }
}

// ---------- Message handling (BroadcastChannel + WebSocket) ----------

function handleMessage(data) {
  if (!data || typeof data !== "object") return;

  switch (data.type) {
    case "switch":
      if (data.blueTeamName !== undefined) setBlueName(data.blueTeamName);
      if (data.redTeamName !== undefined) setRedName(data.redTeamName);
      for (let i = 1; i <= 10; i++) {
        const n = data.names?.[`input-name-${i}`];
        if (n !== undefined) setPlayerName(i, n);
        const p = data.picks?.[`pick-${i}`];
        if (p !== undefined) setPick(i, p, false);
      }
      return;
    case "show-draft-display":
      // Timer was reset on the controller: go back to the draft overlay (same room)
      window.location.href = "display.html" + window.location.search;
      return;
    case "reset":
      setBlueName("");
      setRedName("");
      setLogo("blue", null);
      setLogo("red", null);
      clearNames();
      clearPicks();
      clearScores();
      clearPhotos();
      return;
    case "clear-names":
      clearNames();
      return;
    case "clear-picks":
      clearPicks();
      return;
    case "clear-scores":
      clearScores();
      return;
    case "logo-update":
      setLogo(data.team, data.data);
      return;
    case "player-photo":
      setPhoto(data.slot, data.data);
      return;
    case "clear-player-photos":
      clearPhotos();
      return;
    case "clear-logos":
      setLogo("blue", null);
      setLogo("red", null);
      return;
    case "ai_prediction":
      if (data.data?.slot_type === "pick" && data.data.name) {
        setPick(data.data.slot_index, data.data.name);
      }
      return;
  }

  if (data.blueTeamName !== undefined) setBlueName(data.blueTeamName);
  if (data.redTeamName !== undefined) setRedName(data.redTeamName);
  if (data.roundName !== undefined) setRound(data.roundName);
  if (data.matchNumber !== undefined) setMatch(data.matchNumber);
  if (data.gameNumber !== undefined) setGame(data.gameNumber);

  for (let i = 1; i <= 10; i++) {
    if (data[`input-name-${i}`] !== undefined) setPlayerName(i, data[`input-name-${i}`]);
  }

  if (data.heroPick !== undefined) {
    setPick(data.heroPick.index, data.heroPick.name);
  }
}

// ---------- Storage events (other tabs on the same origin) ----------

function handleStorage(e) {
  const k = e.key;
  if (!k) return;
  const v = e.newValue;

  if (k.startsWith("heroPick-")) return setPick(parseInt(k.split("-")[1], 10), v);
  if (k.startsWith("player-name-")) return setPlayerName(parseInt(k.split("-")[2], 10), v);
  if (k.startsWith("player-photo-")) return setPhoto(parseInt(k.split("-")[2], 10), v);

  switch (k) {
    case "blue-team-name": return setBlueName(v);
    case "red-team-name": return setRedName(v);
    case "round-name": return setRound(v);
    case "match-number": return setMatch(v);
    case "game-number": return setGame(v);
    case "logo-blue": return setLogo("blue", v);
    case "logo-red": return setLogo("red", v);
    case "blue-score": return setScore("blue", v);
    case "red-score": return setScore("red", v);
  }
}

// ---------- Boot ----------

buildCards();
loadFromStorage();

const channel = new BroadcastChannel("team_channel");
channel.onmessage = (event) => handleMessage(event.data);
onMessage(handleMessage);
window.addEventListener("storage", handleStorage);
