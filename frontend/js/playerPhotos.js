// playerPhotos.js — controller side of player photos (used by heroes-display.html).
// Photos are keyed by player slot (same numbering as player-name-N / input-name-N):
//   localStorage "player-photo-N"  +  message { type: "player-photo", slot, data }
// Clearing sends { type: "clear-player-photos" }.

import { send } from "./websocketClient.js";

const channel = new BroadcastChannel("team_channel");

// Photos are downscaled before saving so 10 of them fit in localStorage
// (~5MB shared with logos) and stay light over the WebSocket.
const MAX_HEIGHT = 520;
const MAX_WIDTH = 520;

function resizeImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
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
      callback(data);
    };
    img.onerror = () => alert("Could not read that image.");
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
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
  return true;
}

function init() {
  document.querySelectorAll(".player-photo-upload").forEach((input) => {
    const slot = parseInt(input.dataset.slot, 10);
    setThumb(slot, localStorage.getItem(`player-photo-${slot}`));

    input.addEventListener("change", () => {
      const file = input.files[0];
      input.value = "";
      if (!file) return;
      resizeImage(file, (data) => setPlayerPhoto(slot, data));
    });

    const label = input.closest("label");

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

  document.getElementById("clear-player-photos")?.addEventListener("click", () => {
    for (let i = 1; i <= 10; i++) {
      localStorage.removeItem(`player-photo-${i}`);
      setThumb(i, null);
    }
    broadcast({ type: "clear-player-photos" });
  });

  // Keep thumbnails in sync after Switch Teams / Reset (they change localStorage)
  channel.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg?.type === "reset" || msg?.type === "clear-player-photos") {
      for (let i = 1; i <= 10; i++) setThumb(i, null);
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
}
