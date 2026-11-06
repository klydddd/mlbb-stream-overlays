// playerPhotos.js — controller side of player photos (used by heroes-display.html).
// Photos are keyed by player slot (same numbering as player-name-N / input-name-N):
//   localStorage "player-photo-N"  +  message { type: "player-photo", slot, data }
// Clearing sends { type: "clear-player-photos" }.

import { send } from "./websocketClient.js";
import { removeBackground, hasTransparency, isModelLoaded } from "./bgRemoval.js";

const channel = new BroadcastChannel("team_channel");

// Photos are downscaled before saving so 10 of them fit in localStorage
// (~5MB shared with logos) and stay light over the WebSocket.
const MAX_HEIGHT = 520;
const MAX_WIDTH = 520;

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function downscale(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_WIDTH / img.width, MAX_HEIGHT / img.height);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      // WebP keeps transparency (cut-out photos) and is much smaller than PNG
      let data = canvas.toDataURL("image/webp", 0.85);
      if (!data.startsWith("data:image/webp")) data = canvas.toDataURL("image/png");
      resolve(data);
    };
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = dataUrl;
  });
}

// ---------- Automatic background removal ----------

const AUTO_BG_KEY = "photo-auto-bg";

function autoBgEnabled() {
  return localStorage.getItem(AUTO_BG_KEY) !== "off";
}

function setStatus(label, text) {
  const span = label?.querySelector("span");
  if (!span) return;
  if (!("idleText" in span.dataset)) span.dataset.idleText = span.textContent;
  span.textContent = text ?? span.dataset.idleText;
}

function setBusy(label, busy) {
  label?.classList.toggle("processing", busy);
}

async function processUpload(slot, file, label) {
  try {
    let data = await readFile(file);

    if (autoBgEnabled() && !(await hasTransparency(data))) {
      setBusy(label, true);
      setStatus(label, isModelLoaded() ? "REMOVING BG…" : "LOADING MODEL…");
      try {
        data = await removeBackground(data, {
          onProgress: (stage, pct) => {
            if (stage === "download") setStatus(label, `LOADING MODEL ${Math.round(pct)}%`);
            else setStatus(label, "REMOVING BG…");
          },
        });
        setStatus(label, null);
      } catch (err) {
        console.warn("Background removal failed, using the original photo:", err);
        setStatus(label, "BG FAILED");
        setTimeout(() => setStatus(label, null), 2500);
      } finally {
        setBusy(label, false);
      }
    }

    setPlayerPhoto(slot, await downscale(data));
  } catch (err) {
    setBusy(label, false);
    setStatus(label, null);
    alert(err.message || "Could not read that image.");
  }
}

function setThumb(slot, data) {
  const label = document.querySelector(`.player-photo-upload[data-slot="${slot}"]`)?.closest("label");
  if (!label) return;
  label.classList.toggle("has-photo", !!data);
  label.style.backgroundImage = data ? `url("${data}")` : "";
}

function broadcast(msg) {
  channel.postMessage(msg);
  send(msg);
}

// ---------- Photo zoom (global x team x per-player, in %) ----------
// localStorage "photo-zoom-global" / "photo-zoom-blue" / "photo-zoom-red" / "photo-zoom-N"
// message { type: "photo-zoom", slot: "global" | "blue" | "red" | N, value }
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 5;
const ZOOM_DEFAULT = 100;

function zoomKey(slot) {
  return `photo-zoom-${slot}`;
}

function getZoom(slot) {
  const v = parseInt(localStorage.getItem(zoomKey(slot)), 10);
  return Number.isFinite(v) ? v : ZOOM_DEFAULT;
}

function showZoom(slot, value) {
  const input = document.querySelector(`.photo-zoom-input[data-slot="${slot}"]`);
  if (input) input.value = value;
  const out = document.querySelector(`.photo-zoom-value[data-slot="${slot}"]`);
  if (out) out.textContent = `${value}%`;
}

export function setPhotoZoom(slot, value) {
  const v = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(value)));
  if (v === ZOOM_DEFAULT) localStorage.removeItem(zoomKey(slot));
  else localStorage.setItem(zoomKey(slot), String(v));
  showZoom(slot, v);
  refreshPanState();
  broadcast({ type: "photo-zoom", slot, value: v });
}

function makeZoomControl(slot, { label = "" } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "photo-zoom";
  wrap.title = "Zoom this player's photo (double-click to reset)";
  wrap.innerHTML = `
    ${label ? `<span class="photo-zoom-label">${label}</span>` : ""}
    <input type="range" class="photo-zoom-input" data-slot="${slot}"
           min="${ZOOM_MIN}" max="${ZOOM_MAX}" step="${ZOOM_STEP}" value="${getZoom(slot)}">
    <span class="photo-zoom-value" data-slot="${slot}">${getZoom(slot)}%</span>`;
  const input = wrap.querySelector("input");
  input.addEventListener("input", () => setPhotoZoom(slot, +input.value));
  input.addEventListener("dblclick", () => setPhotoZoom(slot, ZOOM_DEFAULT));
  return wrap;
}

// ---------- Photo vertical position (per player, % of the photo area; negative = up) ----------
// localStorage "photo-offset-N"; message { type: "photo-offset", slot: N, value }
const OFFSET_MIN = -50;
const OFFSET_MAX = 50;
const OFFSET_DEFAULT = 0;

function offsetKey(slot) {
  return `photo-offset-${slot}`;
}

function getOffset(slot) {
  const v = parseInt(localStorage.getItem(offsetKey(slot)), 10);
  return Number.isFinite(v) ? v : OFFSET_DEFAULT;
}

function formatOffset(v) {
  return v === 0 ? "0" : `${v > 0 ? "\u2193" : "\u2191"}${Math.abs(v)}`;
}

function showOffset(slot, value) {
  const input = document.querySelector(`.photo-offset-input[data-slot="${slot}"]`);
  if (input) input.value = -value; // slider right = up
  const out = document.querySelector(`.photo-offset-value[data-slot="${slot}"]`);
  if (out) out.textContent = formatOffset(value);
}

export function setPhotoOffset(slot, value) {
  const v = Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, Math.round(value)));
  if (v === OFFSET_DEFAULT) localStorage.removeItem(offsetKey(slot));
  else localStorage.setItem(offsetKey(slot), String(v));
  showOffset(slot, v);
  broadcast({ type: "photo-offset", slot, value: v });
}

function makeOffsetControl(slot) {
  const wrap = document.createElement("div");
  wrap.className = "photo-zoom photo-offset";
  wrap.title = "Move this player's photo up / down (double-click to reset)";
  const v = getOffset(slot);
  wrap.innerHTML = `
    <span class="photo-zoom-label">\u2195</span>
    <input type="range" class="photo-offset-input" data-slot="${slot}"
           min="${-OFFSET_MAX}" max="${-OFFSET_MIN}" step="1" value="${-v}">
    <span class="photo-offset-value" data-slot="${slot}">${formatOffset(v)}</span>`;
  const input = wrap.querySelector("input");
  input.addEventListener("input", () => setPhotoOffset(slot, -input.value));
  input.addEventListener("dblclick", () => setPhotoOffset(slot, OFFSET_DEFAULT));
  return wrap;
}

// ---------- Photo horizontal position (per player; negative = left) ----------
// localStorage "photo-offsetx-N"; message { type: "photo-offset-x", slot: N, value }
function offsetXKey(slot) {
  return `photo-offsetx-${slot}`;
}

function getOffsetX(slot) {
  const v = parseInt(localStorage.getItem(offsetXKey(slot)), 10);
  return Number.isFinite(v) ? v : OFFSET_DEFAULT;
}

function formatOffsetX(v) {
  return v === 0 ? "0" : `${v > 0 ? "\u2192" : "\u2190"}${Math.abs(v)}`;
}

function showOffsetX(slot, value) {
  const input = document.querySelector(`.photo-offsetx-input[data-slot="${slot}"]`);
  if (input) input.value = value;
  const out = document.querySelector(`.photo-offsetx-value[data-slot="${slot}"]`);
  if (out) out.textContent = formatOffsetX(value);
}

export function setPhotoOffsetX(slot, value) {
  const v = Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, Math.round(value)));
  if (v === OFFSET_DEFAULT) localStorage.removeItem(offsetXKey(slot));
  else localStorage.setItem(offsetXKey(slot), String(v));
  showOffsetX(slot, v);
  broadcast({ type: "photo-offset-x", slot, value: v });
}

function makeOffsetXControl(slot) {
  const wrap = document.createElement("div");
  wrap.className = "photo-zoom photo-offsetx";
  wrap.title = "Move this player's photo left / right (double-click to reset)";
  const v = getOffsetX(slot);
  wrap.innerHTML = `
    <span class="photo-zoom-label">\u2194</span>
    <input type="range" class="photo-offsetx-input" data-slot="${slot}"
           min="${OFFSET_MIN}" max="${OFFSET_MAX}" step="1" value="${v}">
    <span class="photo-offsetx-value" data-slot="${slot}">${formatOffsetX(v)}</span>`;
  const input = wrap.querySelector("input");
  input.addEventListener("input", () => setPhotoOffsetX(slot, +input.value));
  input.addEventListener("dblclick", () => setPhotoOffsetX(slot, OFFSET_DEFAULT));
  return wrap;
}

// Put every zoom and position back to default (keeps photos and the auto toggles)
function resetPhotoAdjustments() {
  ["global", "blue", "red"].forEach((k) => {
    setPhotoZoom(k, ZOOM_DEFAULT);
    setPhotoOffset(k, OFFSET_DEFAULT);
    setPhotoOffsetX(k, OFFSET_DEFAULT);
  });
  for (let i = 1; i <= 10; i++) {
    setPhotoZoom(i, ZOOM_DEFAULT);
    setPhotoOffset(i, OFFSET_DEFAULT);
    setPhotoOffsetX(i, OFFSET_DEFAULT);
  }
}

// ---------- Auto head alignment (display side does the work) ----------
const AUTO_ALIGN_KEY = "photo-auto-align";

function autoAlignEnabled() {
  return localStorage.getItem(AUTO_ALIGN_KEY) !== "off";
}

// POS only does something when the photo is zoomed in (effective zoom > 100%),
// except with auto head alignment, where it nudges the aligned photo up/down.
function refreshPanState() {
  const aligned = autoAlignEnabled();
  for (let i = 1; i <= 10; i++) {
    const team = i <= 5 ? "blue" : "red";
    const z = (getZoom("global") / 100) * (getZoom(team) / 100) * (getZoom(i) / 100);
    const ctl = document.querySelector(`.photo-offset-input[data-slot="${i}"]`)?.closest(".photo-offset");
    if (!ctl) continue;
    const idle = !aligned && z <= 1.001;
    ctl.classList.toggle("inactive", idle);
    ctl.title = idle
      ? "Zoom in first: position pans the zoomed photo inside its frame"
      : "Pan this player's zoomed photo up / down inside its frame (double-click to reset)";
  }
}

function refreshZoomControls() {
  refreshPanState();
  ["global", "blue", "red", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach((k) => {
    showOffset(k, getOffset(k));
    showOffsetX(k, getOffsetX(k));
  });
  ["global", "blue", "red"].forEach((k) => showZoom(k, getZoom(k)));
  for (let i = 1; i <= 10; i++) showZoom(i, getZoom(i));
}

export function setPlayerPhoto(slot, data) {
  try {
    if (data) localStorage.setItem(`player-photo-${slot}`, data);
    else localStorage.removeItem(`player-photo-${slot}`);
  } catch (err) {
    alert("Not enough storage for this photo. Try a smaller image or clear other photos/logos.");
    return false;
  }
  setThumb(slot, data);
  broadcast({ type: "player-photo", slot, data: data || null });
  // Removing a photo also resets its zoom and position
  if (!data && getZoom(slot) !== ZOOM_DEFAULT) setPhotoZoom(slot, ZOOM_DEFAULT);
  if (!data && getOffset(slot) !== OFFSET_DEFAULT) setPhotoOffset(slot, OFFSET_DEFAULT);
  if (!data && getOffsetX(slot) !== OFFSET_DEFAULT) setPhotoOffsetX(slot, OFFSET_DEFAULT);
  return true;
}

function init() {
  document.querySelectorAll(".player-photo-upload").forEach((input) => {
    const slot = parseInt(input.dataset.slot, 10);
    setThumb(slot, localStorage.getItem(`player-photo-${slot}`));

    const label = input.closest("label");

    input.addEventListener("change", () => {
      const file = input.files[0];
      input.value = "";
      if (!file) return;
      processUpload(slot, file, label);
    });

    // "x" button to remove just this photo (only shown when a photo is set).
    // It sits inside the <label>, so stop the click from opening the file picker.
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "photo-remove";
    removeBtn.title = "Remove photo";
    removeBtn.setAttribute("aria-label", "Remove photo");
    removeBtn.textContent = "\u00d7";
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setPlayerPhoto(slot, null);
    });
    label?.appendChild(removeBtn);

    // Right-click still works as a shortcut
    label?.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      setPlayerPhoto(slot, null);
    });
  });

  // Team zoom slider above each team's photo buttons
  document.querySelectorAll(".photos").forEach((row) => {
    const side = row.closest(".red-side") ? "red" : "blue";
    const holder = document.createElement("div");
    holder.className = "photo-zoom-team";
    const ctl = makeZoomControl(side, { label: `${side.toUpperCase()} TEAM PHOTO ZOOM` });
    ctl.title = `Zoom all ${side} team photos (double-click to reset)`;
    const up = makeOffsetControl(side);
    up.title = `Move all ${side} team photos up / down (double-click to reset)`;
    const lr = makeOffsetXControl(side);
    lr.title = `Move all ${side} team photos left / right (double-click to reset)`;
    holder.append(ctl, up, lr);
    row.before(holder);
  });

  // Per-player zoom sliders: one row under each team's photo buttons, same order
  document.querySelectorAll(".photos").forEach((row) => {
    const zooms = document.createElement("div");
    zooms.className = "photo-zooms";
    row.querySelectorAll(".player-photo-upload").forEach((input) => {
      const slot = parseInt(input.dataset.slot, 10);
      const col = document.createElement("div");
      col.className = "photo-adjust";
      const zoom = makeZoomControl(slot, { label: "ZOOM" });
      col.append(zoom, makeOffsetControl(slot), makeOffsetXControl(slot));
      zooms.appendChild(col);
    });
    row.after(zooms);
  });

  // Global zoom slider (multiplies with the per-player value)
  const globalHolder = document.getElementById("photo-zoom-global-holder");
  if (globalHolder) {
    const ctl = makeZoomControl("global", { label: "PHOTO ZOOM" });
    ctl.title = "Zoom all player photos (double-click to reset)";
    const up = makeOffsetControl("global");
    up.title = "Move all player photos up / down (double-click to reset)";
    const lr = makeOffsetXControl("global");
    lr.title = "Move all player photos left / right (double-click to reset)";
    globalHolder.append(ctl, up, lr);
  }

  refreshPanState();

  document.getElementById("reset-photo-adjust")?.addEventListener("click", resetPhotoAdjustments);

  // Auto head alignment toggle
  const autoAlign = document.getElementById("photo-auto-align");
  if (autoAlign) {
    autoAlign.checked = autoAlignEnabled();
    autoAlign.addEventListener("change", () => {
      localStorage.setItem(AUTO_ALIGN_KEY, autoAlign.checked ? "on" : "off");
      refreshPanState();
      broadcast({ type: "photo-align", value: autoAlign.checked });
    });
  }

  // Auto background removal toggle (remembered per browser)
  const autoBg = document.getElementById("photo-auto-bg");
  if (autoBg) {
    autoBg.checked = autoBgEnabled();
    autoBg.addEventListener("change", () => {
      localStorage.setItem(AUTO_BG_KEY, autoBg.checked ? "on" : "off");
    });
  }

  document.getElementById("clear-player-photos")?.addEventListener("click", () => {
    for (let i = 1; i <= 10; i++) {
      localStorage.removeItem(`player-photo-${i}`);
      localStorage.removeItem(zoomKey(i));
      localStorage.removeItem(offsetKey(i));
      localStorage.removeItem(offsetXKey(i));
      setThumb(i, null);
    }
    refreshZoomControls();
    // the display also resets per-player zoom on this message
    broadcast({ type: "clear-player-photos" });
  });

  // Keep thumbnails in sync after Switch Teams / Reset (they change localStorage)
  channel.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg?.type === "reset" || msg?.type === "clear-player-photos") {
      for (let i = 1; i <= 10; i++) setThumb(i, null);
      refreshZoomControls();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Exposed for the Switch Teams handler in control.js
export function refreshPhotoThumbs() {
  for (let i = 1; i <= 10; i++) setThumb(i, localStorage.getItem(`player-photo-${i}`));
  refreshZoomControls();
}
