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
  refs.photoImg = null;
  refs.head = null;
  refs.card.classList.toggle("has-photo", !!data);
  if (!data) return;
  const img = document.createElement("img");
  img.alt = "";
  img.onload = () => {
    if (refs.photoImg !== img) return; // replaced meanwhile
    refs.head = measureHead(img);
    layoutPhoto(slot);
  };
  img.src = data;
  refs.photoImg = img;
  refs.photo.appendChild(img);
}

// ---------- Auto head alignment ----------
// Reads the cut-out's transparency to find the head: its top, width and centre.
// Returns natural-pixel metrics, or null when the photo isn't a cut-out.
function measureHead(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, 256 / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cw, ch);
  const a = ctx.getImageData(0, 0, cw, ch).data;

  // per-row opaque span
  const rows = [];
  for (let y = 0; y < ch; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < cw; x++) {
      if (a[(y * cw + x) * 4 + 3] > 128) {
        if (l < 0) l = x;
        r = x;
      }
    }
    rows.push(l < 0 ? null : { l, r, width: r - l + 1 });
  }

  const top = rows.findIndex((row) => row && row.width > cw * 0.02);
  if (top < 0) return null;
  // Not a cut-out (opaque rectangle): nothing to align
  if (top === 0 && rows[0].width > cw * 0.9) return null;

  // A head is roughly round: going down from its top, the outline's width traces a
  // circle. The first row whose depth reaches ~half of its width is about the
  // head's widest point, and that width is the head's width. (Robust to long hair
  // and doesn't depend on finding the neck.)
  let headW = 0, headRow = -1;
  for (let y = top; y < ch; y++) {
    const wd = rows[y] ? rows[y].width : 0;
    if (wd > 0 && y - top >= wd * 0.55) {
      headW = wd;
      headRow = y;
      break;
    }
  }
  if (headRow < 0) return null;
  const cx = (rows[headRow].l + rows[headRow].r) / 2;

  return { w, h, top: top / scale, headW: headW / scale, cx: cx / scale };
}

// Target framing for aligned heads
const HEAD_WIDTH = 0.5;   // head width as a share of the card width
const HEAD_TOP = 0.04;    // head top line, from the top of the photo region (bottom 60% of card)
const MAX_FILL = 1.6;     // tight headshots may be enlarged up to this much to reach the name bar
const PAN_RANGE = 0.25;   // POS range in auto mode, share of the photo region

let autoAlign = true;

function setAutoAlign(on) {
  autoAlign = on !== false && on !== "off";
  for (let i = 1; i <= 10; i++) layoutPhoto(i);
}

// Places the photo inside its frame (everything above the name bar) in pixels.
function layoutPhoto(slot) {
  const refs = cardsByPlayer[slot];
  const img = refs?.photoImg;
  if (!img || !img.naturalWidth) return;

  const W = refs.photo.clientWidth;          // frame width
  const FH = refs.photo.clientHeight;        // frame height (bottom = name bar)
  const RH = refs.card.clientHeight * 0.6;   // photo region (bottom 60% of the card)
  const RT = FH - RH;                        // photo region top, inside the frame
  const w = img.naturalWidth, h = img.naturalHeight;

  const team = slot <= 5 ? "blue" : "red";
  const z = (zoomGlobal / 100) * (zoomTeam[team] / 100) * ((zoomBySlot[slot] ?? 100) / 100);
  const pan = Math.max(-1, Math.min(1, effectiveOffset(offsetBySlot, slot) / 50));

  let s, x, y;
  const head = autoAlign ? refs.head : null;

  if (head) {
    // Same head width and head-top line on every card, head centred horizontally
    const lineY = RT + HEAD_TOP * RH;
    let base = (HEAD_WIDTH * W) / head.headW;
    // If the photo is a tight crop that would float above the name bar, enlarge it
    // (keeping the head on the line) just enough to reach the bar, within a limit
    const reach = (FH - lineY) / (h - head.top);
    if (base < reach) base = Math.min(reach, base * MAX_FILL);
    s = base * z;
    // zoom scales around the head's centre so it stays aligned
    const headCy = head.top + head.headW * 0.6;
    const anchorY = lineY + headCy * base;
    x = W / 2 - head.cx * s;
    y = anchorY - headCy * s + pan * PAN_RANGE * RH;
  } else {
    // Cover the photo region, standing on the name bar; zoom from the centre and
    // pan only within the extra image that zooming creates.
    const s0 = Math.max(W / w, RH / h);
    const h0 = h * s0;
    s = s0 * z;
    x = (W - w * s) / 2;
    const y0 = FH - h0;
    y = z >= 1 ? y0 + (h0 - h * s) / 2 + (pan * (z - 1) * h0) / 2 : FH - h * s;
  }

  // Left / right: up to a quarter of the card width, or the photo's side overflow if larger
  const panX = Math.max(-1, Math.min(1, effectiveOffset(offsetXBySlot, slot) / 50));
  x += panX * Math.max(0.25 * W, (w * s - W) / 2);

  // Never let the photo lift off the name bar
  if (y + h * s < FH) y = FH - h * s;

  img.style.width = `${(w * s).toFixed(1)}px`;
  img.style.height = `${(h * s).toFixed(1)}px`;
  img.style.left = `${x.toFixed(1)}px`;
  img.style.top = `${y.toFixed(1)}px`;
}

function clearPhotos() {
  for (let i = 1; i <= 10; i++) {
    setPhoto(i, null);
    zoomBySlot[i] = 100;
    applyZoom(i);
    setOffset(i, 0);
    setOffsetX(i, 0);
  }
}

// Photo zoom = global % x team % x per-player % (set from the controller)
// Player slots 1-5 are blue, 6-10 red (same numbering as player names).
let zoomGlobal = 100;
const zoomTeam = { blue: 100, red: 100 };
const zoomBySlot = {};

function applyZoom(slot) {
  const refs = cardsByPlayer[slot];
  if (!refs) return;
  layoutPhoto(slot);
}

// Per-player pan, -50..50 (negative = up). It pans the zoomed photo *inside* its
// frame: the range is only the extra image created by zooming in, so the photo's
// bottom edge never lifts off the name bar and never leaves a gap.
// Keys: player slot 1-10, or "global" / "blue" / "red". Effective offset = global + team + player.
const offsetBySlot = {};
const offsetXBySlot = {}; // left/right, -50..50 (negative = left)

const GROUP_KEYS = ["global", "blue", "red"];
const slotKey = (slot) => (GROUP_KEYS.includes(slot) ? slot : parseInt(slot, 10));

function relayout(slot) {
  if (GROUP_KEYS.includes(slot)) for (let i = 1; i <= 10; i++) applyZoom(i);
  else applyZoom(slot);
}

function setOffsetX(slot, value) {
  offsetXBySlot[slot] = Number.isFinite(+value) ? +value : 0;
  relayout(slot);
}

function setOffset(slot, value) {
  offsetBySlot[slot] = Number.isFinite(+value) ? +value : 0;
  relayout(slot);
}

function effectiveOffset(map, slot) {
  const team = slot <= 5 ? "blue" : "red";
  return (map.global ?? 0) + (map[team] ?? 0) + (map[slot] ?? 0);
}

function setZoom(slot, value) {
  const v = Number.isFinite(+value) && +value > 0 ? +value : 100;
  if (slot === "global") {
    zoomGlobal = v;
    for (let i = 1; i <= 10; i++) applyZoom(i);
  } else if (slot === "blue" || slot === "red") {
    zoomTeam[slot] = v;
    for (let i = 1; i <= 10; i++) applyZoom(i);
  } else {
    zoomBySlot[slot] = v;
    applyZoom(slot);
  }
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
  setZoom("global", ls("photo-zoom-global") ?? 100);
  setZoom("blue", ls("photo-zoom-blue") ?? 100);
  setZoom("red", ls("photo-zoom-red") ?? 100);
  setAutoAlign(ls("photo-auto-align") ?? "on");
  GROUP_KEYS.forEach((k) => {
    setOffset(k, ls(`photo-offset-${k}`) ?? 0);
    setOffsetX(k, ls(`photo-offsetx-${k}`) ?? 0);
  });

  for (let i = 1; i <= 10; i++) {
    setPlayerName(i, ls(`player-name-${i}`));
    setPhoto(i, ls(`player-photo-${i}`));
    setZoom(i, ls(`photo-zoom-${i}`) ?? 100);
    setOffset(i, ls(`photo-offset-${i}`) ?? 0);
    setOffsetX(i, ls(`photo-offsetx-${i}`) ?? 0);
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
      GROUP_KEYS.forEach((k) => {
        setZoom(k, 100);
        setOffset(k, 0);
        setOffsetX(k, 0);
      });
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
    case "score-update":
      if (data.team === "blue" || data.team === "red") setScore(data.team, data.value);
      return;
    case "logo-update":
      setLogo(data.team, data.data);
      return;
    case "player-photo":
      setPhoto(data.slot, data.data);
      return;
    case "photo-align":
      setAutoAlign(data.value);
      return;
    case "photo-offset-x":
      setOffsetX(slotKey(data.slot), data.value);
      return;
    case "photo-offset":
      setOffset(slotKey(data.slot), data.value);
      return;
    case "photo-zoom":
      setZoom(["global", "blue", "red"].includes(data.slot) ? data.slot : parseInt(data.slot, 10), data.value);
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
  if (k === "photo-auto-align") return setAutoAlign(v ?? "on");
  if (k.startsWith("photo-offsetx-")) return setOffsetX(slotKey(k.split("-")[2]), v ?? 0);
  if (k.startsWith("photo-offset-")) return setOffset(slotKey(k.split("-")[2]), v ?? 0);
  if (k === "photo-zoom-global") return setZoom("global", v ?? 100);
  if (k === "photo-zoom-blue") return setZoom("blue", v ?? 100);
  if (k === "photo-zoom-red") return setZoom("red", v ?? 100);
  if (k.startsWith("photo-zoom-")) return setZoom(parseInt(k.split("-")[2], 10), v ?? 100);

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
