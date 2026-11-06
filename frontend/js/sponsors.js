// Sponsor logo slideshow controls (controller.html, INGAME mode).
// Shown in the top-right white area of gameDisplay.html.
//
// localStorage: "sponsors"          JSON { partner: [dataUrl], presented: [...], sponsored: [...] }
//               "sponsor-interval"  seconds per logo
// Message:      { type: "sponsors", sponsors, interval }  (BroadcastChannel + WebSocket)
import { send } from "./websocketClient.js";

const channel = new BroadcastChannel("team_channel");

export const SPONSOR_GROUPS = ["partner", "presented", "sponsored"];
const DEFAULT_INTERVAL = 5;
// Logos are downscaled before storing: the overlay slot is ~370x55, and
// localStorage only holds ~5MB shared with team logos and player photos.
const MAX_W = 740;
const MAX_H = 120;

function load() {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem("sponsors") || "{}") || {};
  } catch (e) { /* ignore */ }
  const out = {};
  SPONSOR_GROUPS.forEach((g) => { out[g] = Array.isArray(data[g]) ? data[g] : []; });
  return out;
}

function getInterval() {
  const v = parseFloat(localStorage.getItem("sponsor-interval"));
  return v >= 1 ? v : DEFAULT_INTERVAL;
}

const note = document.getElementById("sponsor-note");

function setNote(text) {
  if (note) note.textContent = text;
}

function save(sponsors) {
  try {
    localStorage.setItem("sponsors", JSON.stringify(sponsors));
    setNote("");
  } catch (e) {
    // Quota exceeded: keep syncing live, but warn that it won't survive a reload
    setNote("STORAGE FULL: LOGOS SHOW NOW BUT WON'T BE RESTORED AFTER A RELOAD");
  }
  const msg = { type: "sponsors", sponsors, interval: getInterval() };
  channel.postMessage(msg);
  send(msg);
  render(sponsors);
}

function shrink(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, MAX_W / img.width, MAX_H / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png")); // PNG keeps transparency
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function render(sponsors = load()) {
  SPONSOR_GROUPS.forEach((group) => {
    const list = document.querySelector(`[data-sponsor-list="${group}"]`);
    if (!list) return;
    list.innerHTML = "";
    sponsors[group].forEach((src, i) => {
      const item = document.createElement("div");
      item.className = "sponsor-thumb";
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Remove this logo";
      remove.addEventListener("click", () => {
        const next = load();
        next[group].splice(i, 1);
        save(next);
      });
      item.append(img, remove);
      list.appendChild(item);
    });
    const count = document.querySelector(`[data-sponsor-count="${group}"]`);
    if (count) count.textContent = sponsors[group].length ? `${sponsors[group].length}` : "";
  });
}

document.querySelectorAll("input[data-sponsor-upload]").forEach((input) => {
  input.addEventListener("change", async () => {
    const group = input.dataset.sponsorUpload;
    const files = [...input.files];
    input.value = ""; // allow re-uploading the same file
    if (!files.length) return;
    try {
      const added = await Promise.all(files.map(shrink));
      const next = load();
      next[group].push(...added);
      save(next);
    } catch (e) {
      setNote("COULDN'T READ ONE OF THOSE IMAGES");
    }
  });
});

const intervalInput = document.getElementById("sponsor-interval");
if (intervalInput) {
  intervalInput.value = getInterval();
  intervalInput.addEventListener("change", () => {
    const v = Math.max(1, parseFloat(intervalInput.value) || DEFAULT_INTERVAL);
    intervalInput.value = v;
    localStorage.setItem("sponsor-interval", String(v));
    const msg = { type: "sponsors", sponsors: load(), interval: v };
    channel.postMessage(msg);
    send(msg);
  });
}

document.getElementById("clear-sponsors")?.addEventListener("click", () => {
  const empty = {};
  SPONSOR_GROUPS.forEach((g) => { empty[g] = []; });
  save(empty);
});

// RESET DRAFT wipes localStorage (control.js runs first)
document.getElementById("reset")?.addEventListener("click", () => {
  render();
  if (intervalInput) intervalInput.value = getInterval();
});

window.addEventListener("storage", (e) => {
  if (e.key === null || e.key === "sponsors") render();
  if ((e.key === null || e.key === "sponsor-interval") && intervalInput) intervalInput.value = getInterval();
});

render();
