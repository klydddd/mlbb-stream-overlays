// WAITING tab controls (controller.html, mode "waiting" in panels.js) for waiting.html.
// Syncs over all three channels (localStorage, BroadcastChannel, WebSocket).
//
// localStorage / messages (see js/waiting.js for the display side):
//   "waiting-countdown"  { running, remaining, endsAt }   { type: "waiting-countdown", running, remaining }
//   "waiting-info"       { stage, event, region, ticker, video }   { type: "waiting-info", info }
//   "waiting-schedule"   [match]                         { type: "waiting-schedule", matches }
//     match: { a: {tag, name, logo, score}, b: {...}, time, format }
//   "waiting-logo"       dataUrl (event logo, header left; not the in-game league logo)
//                                                        { type: "waiting-logo", logo }
// Answers { type: "waiting-request" } (sent by waiting.html on connect) with the full state,
// and resends the countdown every 5 s while it runs so a late display catches up.
import { send, onMessage } from "./websocketClient.js";

const channel = new BroadcastChannel("team_channel");
const MAX_MATCHES = 4;
const LOGO_PX = 160; // the overlay shows logos at 78px

function broadcast(msg) {
  channel.postMessage(msg);
  send(msg);
}

function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch (e) {
    return fallback;
  }
}

const note = document.getElementById("waiting-note");
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (note) note.textContent = "";
  } catch (e) {
    if (note) note.textContent = "STORAGE FULL: SHOWS NOW BUT WON'T BE RESTORED AFTER A RELOAD";
  }
}

// ---------- Countdown ----------

let countdown = readJSON("waiting-countdown", { running: false, remaining: 0, endsAt: 0 });

function msLeft() {
  return countdown.running ? Math.max(0, countdown.endsAt - Date.now()) : Math.max(0, countdown.remaining || 0);
}

function sendCountdown() {
  broadcast({ type: "waiting-countdown", running: countdown.running, remaining: msLeft() });
}

function setCountdown(running, remaining) {
  remaining = Math.max(0, Math.round(remaining));
  countdown = { running, remaining, endsAt: running ? Date.now() + remaining : 0 };
  writeJSON("waiting-countdown", countdown);
  sendCountdown();
  renderCountdown();
}

const fmt = (ms) => {
  const t = Math.ceil(ms / 1000);
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

const preview = document.getElementById("waiting-countdown-preview");
const pauseBtn = document.getElementById("waiting-pause");

function renderCountdown() {
  if (preview) preview.textContent = fmt(msLeft());
  if (pauseBtn) {
    pauseBtn.textContent = countdown.running ? "PAUSE" : "RESUME";
    pauseBtn.disabled = !countdown.running && !(countdown.remaining > 0);
  }
}
setInterval(renderCountdown, 250);

const minutesInput = document.getElementById("waiting-minutes");
const untilInput = document.getElementById("waiting-until");

document.getElementById("waiting-start")?.addEventListener("click", () => {
  const mins = parseFloat(minutesInput?.value);
  if (mins > 0) setCountdown(true, mins * 60000);
});

// count down to a clock time today (tomorrow if it has already passed)
document.getElementById("waiting-start-until")?.addEventListener("click", () => {
  const [h, m] = (untilInput?.value || "").split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return;
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= new Date()) target.setDate(target.getDate() + 1);
  setCountdown(true, target - Date.now());
});

document.querySelectorAll("[data-waiting-adjust]").forEach((btn) => {
  btn.addEventListener("click", () => {
    setCountdown(countdown.running, msLeft() + parseFloat(btn.dataset.waitingAdjust) * 60000);
  });
});

pauseBtn?.addEventListener("click", () => setCountdown(!countdown.running, msLeft()));
document.getElementById("waiting-countdown-reset")?.addEventListener("click", () => setCountdown(false, 0));

setInterval(() => { if (countdown.running) sendCountdown(); }, 5000);

// ---------- Info ----------

const INFO_FIELDS = ["stage", "event", "region", "ticker", "video"];
let info = readJSON("waiting-info", {});

function sendInfo() {
  broadcast({ type: "waiting-info", info });
}

INFO_FIELDS.forEach((field) => {
  const input = document.querySelector(`[data-waiting-info="${field}"]`);
  if (!input) return;
  input.value = info[field] || "";
  // the video URL applies on Enter / blur so a half-typed URL never loads
  const evt = field === "video" ? "change" : "input";
  input.addEventListener(evt, () => {
    info = { ...info, [field]: input.value };
    writeJSON("waiting-info", info);
    sendInfo();
  });
});

// ---------- Event logo ----------
// Kept apart from waiting-info so typing doesn't resend the image on every keystroke.

let eventLogo = localStorage.getItem("waiting-logo") || "";
const logoUpload = document.getElementById("waiting-logo-upload");
const logoPreview = document.getElementById("waiting-logo-preview");
const logoClear = document.getElementById("waiting-logo-clear");

function renderLogo() {
  if (logoPreview) {
    logoPreview.hidden = !eventLogo;
    if (eventLogo) logoPreview.src = eventLogo;
  }
  if (logoClear) logoClear.hidden = !eventLogo;
}

function sendLogo() {
  broadcast({ type: "waiting-logo", logo: eventLogo });
}

function setLogo(dataUrl) {
  eventLogo = dataUrl;
  try {
    if (eventLogo) localStorage.setItem("waiting-logo", eventLogo);
    else localStorage.removeItem("waiting-logo");
    if (note) note.textContent = "";
  } catch (e) {
    if (note) note.textContent = "STORAGE FULL: SHOWS NOW BUT WON'T BE RESTORED AFTER A RELOAD";
  }
  sendLogo();
  renderLogo();
}

logoUpload?.addEventListener("change", async () => {
  const file = logoUpload.files[0];
  logoUpload.value = "";
  if (!file) return;
  try {
    // header slot is 300x120; 2x for sharpness
    setLogo(await shrinkLogo(file, 600, 240));
  } catch (e) {
    if (note) note.textContent = "COULDN'T READ THAT IMAGE";
  }
});
logoClear?.addEventListener("click", () => setLogo(""));
renderLogo();

// ---------- Schedule ----------

let matches = readJSON("waiting-schedule", []);
const list = document.getElementById("waiting-matches");
const addBtn = document.getElementById("waiting-add-match");

const emptyTeam = () => ({ tag: "", name: "", logo: "", score: 0 });
const emptyMatch = () => ({ a: emptyTeam(), b: emptyTeam(), time: "", format: "BO3" });

let sendTimer = null;
function saveSchedule(now = false) {
  writeJSON("waiting-schedule", matches);
  // typing sends at most every 250 ms (each message carries every logo)
  clearTimeout(sendTimer);
  const go = () => broadcast({ type: "waiting-schedule", matches });
  if (now) go();
  else sendTimer = setTimeout(go, 250);
}

function shrinkLogo(file, maxW = LOGO_PX, maxH = LOGO_PX) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  children.forEach((c) => node.append(c));
  return node;
}

function teamEditor(match, side) {
  const t = match[side];
  const label = side === "a" ? "LEFT TEAM" : "RIGHT TEAM";

  const thumb = el("img", { alt: "", hidden: !t.logo, src: t.logo || "" });
  const file = el("input", { type: "file", accept: "image/*" });
  file.addEventListener("change", async () => {
    const f = file.files[0];
    file.value = "";
    if (!f) return;
    try {
      t.logo = await shrinkLogo(f);
      thumb.src = t.logo;
      thumb.hidden = false;
      clearLogo.hidden = false;
      saveSchedule(true);
    } catch (e) {
      if (note) note.textContent = "COULDN'T READ THAT IMAGE";
    }
  });
  const upload = el("label", { className: "custom-file-upload wm-logo", title: `${label} logo` }, [file, thumb, el("span", { textContent: "LOGO" })]);
  const clearLogo = el("button", { type: "button", className: "wm-x", textContent: "×", title: "Remove logo", hidden: !t.logo });
  clearLogo.addEventListener("click", () => {
    t.logo = "";
    thumb.hidden = true;
    clearLogo.hidden = true;
    saveSchedule(true);
  });

  const field = (key, placeholder, extra = {}) => {
    const input = el("input", { type: "text", value: t[key] ?? "", placeholder, ...extra });
    input.setAttribute("aria-label", `${label} ${placeholder.toLowerCase()}`);
    input.addEventListener("input", () => {
      t[key] = key === "score" ? Math.max(0, parseInt(input.value, 10) || 0) : input.value;
      saveSchedule();
    });
    return input;
  };

  return el("div", { className: `wm-team ${side}` }, [
    upload,
    clearLogo,
    field("tag", "TAG", { className: "wm-tag" }),
    field("name", "FULL NAME", { className: "wm-name" }),
    field("score", "SCORE", { className: "wm-score", type: "number", min: 0 }),
  ]);
}

function renderSchedule() {
  if (!list) return;
  list.innerHTML = "";
  matches.forEach((m, i) => {
    const time = el("input", { type: "text", value: m.time || "", placeholder: "01:00 PM", className: "wm-time" });
    time.setAttribute("aria-label", `Match ${i + 1} time`);
    time.addEventListener("input", () => { m.time = time.value; saveSchedule(); });
    const format = el("input", { type: "text", value: m.format || "", placeholder: "BO3", className: "wm-format" });
    format.setAttribute("aria-label", `Match ${i + 1} format`);
    format.addEventListener("input", () => { m.format = format.value; saveSchedule(); });

    const up = el("button", { type: "button", textContent: "↑", title: "Move up", disabled: i === 0 });
    up.addEventListener("click", () => {
      [matches[i - 1], matches[i]] = [matches[i], matches[i - 1]];
      saveSchedule(true);
      renderSchedule();
    });
    const remove = el("button", { type: "button", textContent: "REMOVE", className: "wm-remove" });
    remove.addEventListener("click", () => {
      matches.splice(i, 1);
      saveSchedule(true);
      renderSchedule();
    });

    list.append(el("div", { className: "wm-card" }, [
      el("span", { className: "wm-num", textContent: `MATCH ${i + 1}` }),
      teamEditor(m, "a"),
      el("div", { className: "wm-mid" }, [time, format]),
      teamEditor(m, "b"),
      el("div", { className: "wm-actions" }, [up, remove]),
    ]));
  });
  if (addBtn) addBtn.disabled = matches.length >= MAX_MATCHES;
}

addBtn?.addEventListener("click", () => {
  if (matches.length >= MAX_MATCHES) return;
  matches.push(emptyMatch());
  saveSchedule(true);
  renderSchedule();
});

renderSchedule();
renderCountdown();

// ---------- Keep state across RESET DRAFT and answer late displays ----------

function sendAll() {
  sendCountdown();
  sendInfo();
  sendLogo();
  broadcast({ type: "waiting-schedule", matches });
}

// RESET DRAFT clears all of localStorage (control.js runs first); the waiting screen
// isn't draft data, so write it back.
document.getElementById("reset")?.addEventListener("click", () => {
  writeJSON("waiting-countdown", countdown);
  writeJSON("waiting-info", info);
  writeJSON("waiting-schedule", matches);
  try { if (eventLogo) localStorage.setItem("waiting-logo", eventLogo); } catch (e) { /* ignore */ }
});

function handleRequest(data) {
  if (data?.type === "waiting-request") sendAll();
}
channel.addEventListener("message", (e) => handleRequest(e.data));
onMessage(handleRequest);
