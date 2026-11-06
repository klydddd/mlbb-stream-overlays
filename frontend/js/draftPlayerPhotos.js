// draftPlayerPhotos.js — shows a player's photo in their pick slot on display.html
// while that slot is the active pick (activePick.js adds .blue-picks / .red-picks).
// Once the hero locks in, the hero portrait in the foreground covers it.
//
// Photos come from the controller's player photos (js/playerPhotos.js):
//   localStorage "player-photo-N"  +  message { type: "player-photo", slot, data }
// Slots map to players by row, same as the name row under the picks:
//   blue pick slots 1,4,5,8,9 -> players 1-5, red pick slots 10,7,6,3,2 -> players 6-10.

import { onMessage } from "./websocketClient.js";

const PICK_TO_PLAYER = { 1: 1, 4: 2, 5: 3, 8: 4, 9: 5, 10: 6, 7: 7, 6: 8, 3: 9, 2: 10 };

const photos = {}; // player slot -> <img>

for (const [pick, player] of Object.entries(PICK_TO_PLAYER)) {
  const container = document.querySelector(`.pick-section-background .pick-${pick}`);
  if (!container) continue;
  const img = document.createElement("img");
  img.className = "draft-player-photo";
  img.alt = "";
  container.appendChild(img);
  photos[player] = img;
}

function setPhoto(slot, data) {
  const img = photos[slot];
  if (!img) return;
  if (data) img.src = data;
  else img.removeAttribute("src");
  img.parentElement.classList.toggle("has-player-photo", !!data);
}

function clearPhotos() {
  for (let i = 1; i <= 10; i++) setPhoto(i, null);
}

// DRAFT PHOTO ZOOM from the controller, in % (localStorage "draft-photo-zoom",
// message { type: "draft-photo-zoom", value })
function setZoom(value) {
  const v = Number.isFinite(+value) && +value > 0 ? +value : 100;
  document.documentElement.style.setProperty("--draft-photo-zoom", String(v / 100));
}

function handleMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "player-photo") setPhoto(Number(msg.slot), msg.data);
  else if (msg.type === "draft-photo-zoom") setZoom(msg.value);
  else if (msg.type === "clear-player-photos" || msg.type === "reset") clearPhotos();
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

for (let i = 1; i <= 10; i++) setPhoto(i, readStorage(`player-photo-${i}`));
setZoom(readStorage("draft-photo-zoom") ?? 100);

new BroadcastChannel("team_channel").addEventListener("message", (e) => handleMessage(e.data));
onMessage(handleMessage);

window.addEventListener("storage", (e) => {
  if (e.key === null) { // localStorage.clear()
    clearPhotos();
    setZoom(100);
    return;
  }
  if (e.key === "draft-photo-zoom") return setZoom(e.newValue ?? 100);
  if (e.key.startsWith("player-photo-")) setPhoto(parseInt(e.key.split("-")[2], 10), e.newValue);
});

// ---------- Lock-in reveal (start of the final phase) ----------
// When the controller enters the final phase it sends { type: "draft-locked-in" }:
// every player with a photo gets it wiped up over their hero portrait for ~3s while
// the center text reads LOCKED IN, then the photos wipe away and the heroes are back.
// Cards are opaque (no opacity fades) so OBS composites them cleanly.
const LOCKIN_HOLD_MS = 3000;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.55, 0, 0.75, 0.2)";
let lockInPlaying = false;

export function playLockIn() {
  if (lockInPlaying) return; // message arrives via both BroadcastChannel and WebSocket
  const cards = [];
  for (const [pick, player] of Object.entries(PICK_TO_PLAYER)) {
    const data = photos[player]?.getAttribute("src");
    const slot = document.getElementById(`hero-${pick}`);
    if (!data || !slot) continue;
    const card = document.createElement("div");
    card.className = `lockin-card ${player <= 5 ? "lockin-blue" : "lockin-red"}`;
    const img = document.createElement("img");
    img.src = data;
    img.alt = "";
    card.appendChild(img);
    slot.appendChild(card);
    cards.push({ card, img, player });
  }
  if (!cards.length) return;
  lockInPlaying = true;

  const label = document.getElementById("pickOrBan");
  const previousLabel = label?.textContent;
  if (label) label.textContent = "LOCKED IN";

  // Reveal from both outer edges in to the center. Player numbers run left to right
  // across the screen (blue 1-5, red 6-10), so step 0 is players 1 and 10, step 4 is 5 and 6.
  const step = (player) => (player <= 5 ? player - 1 : 10 - player);
  cards.forEach(({ card, img, player }) => {
    const delay = step(player) * 90;
    card.animate(
      [{ clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
      { duration: 550, delay, easing: EASE_OUT, fill: "both" }
    );
    img.animate(
      [{ transform: "translateY(24px) scale(1.06)" }, { transform: "none" }],
      { duration: 1000, delay, easing: EASE_OUT, fill: "both" }
    );
  });

  // hold, then wipe the photos back down (same sides-to-center order) to show the heroes
  setTimeout(() => {
    const exits = cards.map(({ card, player }) =>
      card.animate(
        [{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(100% 0 0 0)" }],
        { duration: 400, delay: step(player) * 60, easing: EASE_IN, fill: "forwards" }
      ).finished.catch(() => {})
    );
    Promise.all(exits).then(() => {
      cards.forEach(({ card }) => card.remove());
      if (label && label.textContent === "LOCKED IN") label.textContent = previousLabel;
      lockInPlaying = false;
    });
  }, LOCKIN_HOLD_MS);
}

function handleLockIn(msg) {
  if (msg?.type === "draft-locked-in") playLockIn();
}
new BroadcastChannel("team_channel").addEventListener("message", (e) => handleLockIn(e.data));
onMessage(handleLockIn);
