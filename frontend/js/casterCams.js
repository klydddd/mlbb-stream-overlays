// Caster cams (controller.html, CASTER CAMS panel; visible in SETUP and LIVE).
// 1 CASTER / 2 CASTERS toggles which caster cams show on display.html; clicking the
// active one again hides them. Each caster has a name and a vdo.ninja view link.
// Names are also written into the INGAME casters field (js/ingame.js), which syncs
// the "NAME | NAME" bar on gameDisplay.html.
//
// localStorage: caster-layout ("" | "1" | "2"), caster-name-1/2, caster-link-1/2
// Message:      { type: "caster-cams", layout, obs, casters: [{ name, link }, { name, link }] }
//               obs: true = the feeds play in OBS sources (localStorage caster-cams-obs, js/obsWebsocket/camSources.js)
// Answers { type: "cams-request" } (sent by cams.html on connect) with the current state.
// View (zoom / position / mirror, js/casterView.js): sliders and MIRROR/RESET per cam
// plus an ALL CAMS row. Keys caster-zoom-N, caster-x-N, caster-y-N, caster-mirror-N and
// caster-zoom-all, caster-mirror-all; sent as casters[i].view and a top-level view.
import { onMessage, send } from "./websocketClient.js";
import { DEFAULT_VIEW, readCasterView, readGlobalView } from "./casterView.js";

const channel = new BroadcastChannel("team_channel");
const SLOTS = [1, 2];
const get = (k) => localStorage.getItem(k);

const nameInput = (n) => document.getElementById(`caster-name-${n}`);
const linkInput = (n) => document.getElementById(`caster-link-${n}`);

function getLayout() {
  const v = localStorage.getItem("caster-layout");
  return v === "1" || v === "2" ? v : "";
}

function state() {
  return {
    type: "caster-cams",
    layout: getLayout(),
    view: readGlobalView(get),
    obs: localStorage.getItem("caster-cams-obs") === "1", // OBS CAM SOURCES (js/obsWebsocket/camSources.js)
    casters: SLOTS.map((n) => ({
      name: localStorage.getItem(`caster-name-${n}`) || "",
      link: localStorage.getItem(`caster-link-${n}`) || "",
      view: readCasterView(get, n),
    })),
  };
}

function broadcast() {
  const msg = state();
  channel.postMessage(msg);
  send(msg);
}

function store(key, value) {
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}

// Write the caster names into the INGAME casters field. Dispatching "input" lets
// js/ingame.js store and broadcast it exactly as if the operator had typed it.
function syncIngameCasters() {
  const field = document.getElementById("casters-input");
  if (!field) return;
  const count = getLayout() === "1" ? 1 : 2;
  const names = SLOTS.slice(0, count)
    .map((n) => (nameInput(n)?.value || "").trim())
    .filter(Boolean);
  const value = names.join(" | ");
  if (field.value === value) return;
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function render() {
  const layout = getLayout();
  document.querySelectorAll("[data-caster-layout]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.casterLayout === layout));
  });
  // show only the inputs for the casters on screen
  document.querySelectorAll("[data-caster-slot]").forEach((row) => {
    row.hidden = !layout || Number(row.dataset.casterSlot) > Number(layout);
  });
  const hint = document.getElementById("caster-cams-hint");
  if (hint) hint.hidden = !!layout;
  SLOTS.forEach((n) => {
    if (nameInput(n)) nameInput(n).value = localStorage.getItem(`caster-name-${n}`) || "";
    if (linkInput(n)) linkInput(n).value = localStorage.getItem(`caster-link-${n}`) || "";
  });
  renderViews(layout);
}

// ---------- zoom / position / mirror ----------
const SLIDERS = [
  ...SLOTS.flatMap((n) => [
    { key: `caster-zoom-${n}`, def: DEFAULT_VIEW.zoom, unit: "%" },
    { key: `caster-x-${n}`, def: DEFAULT_VIEW.x, unit: "" },
    { key: `caster-y-${n}`, def: DEFAULT_VIEW.y, unit: "" },
  ]),
  { key: "caster-zoom-all", def: DEFAULT_VIEW.zoom, unit: "%" },
];
const MIRRORS = [...SLOTS.map((n) => `caster-mirror-${n}`), "caster-mirror-all"];
const RESETS = {
  1: ["caster-zoom-1", "caster-x-1", "caster-y-1", "caster-mirror-1"],
  2: ["caster-zoom-2", "caster-x-2", "caster-y-2", "caster-mirror-2"],
  all: ["caster-zoom-all", "caster-mirror-all"],
};

function viewValues() {
  const values = {};
  SLOTS.forEach((n) => {
    const v = readCasterView(get, n);
    values[`caster-zoom-${n}`] = v.zoom;
    values[`caster-x-${n}`] = v.x;
    values[`caster-y-${n}`] = v.y;
    values[`caster-mirror-${n}`] = v.mirror;
  });
  const g = readGlobalView(get);
  values["caster-zoom-all"] = g.zoom;
  values["caster-mirror-all"] = g.mirror;
  return values;
}

// Always set from storage, so RESET DRAFT (which clears localStorage) puts the sliders
// back to their defaults instead of wherever the browser leaves an emptied range input.
function renderViews(layout) {
  const values = viewValues();
  SLIDERS.forEach(({ key, unit }) => {
    const input = document.getElementById(key);
    const out = document.getElementById(`${key}-value`);
    if (input) input.value = String(values[key]);
    if (out) out.textContent = `${values[key]}${unit}`;
  });
  MIRRORS.forEach((key) => {
    document.getElementById(key)?.setAttribute("aria-pressed", String(values[key]));
  });
  const all = document.getElementById("caster-view-all");
  if (all) all.hidden = !layout;
}

SLIDERS.forEach(({ key, def, unit }) => {
  const input = document.getElementById(key);
  input?.addEventListener("input", () => {
    const value = Number(input.value);
    store(key, value === def ? "" : String(value)); // a default is stored as "missing"
    const out = document.getElementById(`${key}-value`);
    if (out) out.textContent = `${value}${unit}`;
    broadcast();
  });
});

MIRRORS.forEach((key) => {
  document.getElementById(key)?.addEventListener("click", () => {
    store(key, localStorage.getItem(key) === "1" ? "" : "1");
    renderViews(getLayout());
    broadcast();
  });
});

Object.entries(RESETS).forEach(([id, keys]) => {
  document.getElementById(`caster-view-reset-${id}`)?.addEventListener("click", () => {
    keys.forEach((k) => localStorage.removeItem(k));
    renderViews(getLayout());
    broadcast();
  });
});

document.querySelectorAll("[data-caster-layout]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = getLayout() === btn.dataset.casterLayout ? "" : btn.dataset.casterLayout;
    store("caster-layout", next);
    render();
    broadcast();
    if (next) syncIngameCasters();
  });
});

SLOTS.forEach((n) => {
  // names update live as they're typed
  nameInput(n)?.addEventListener("input", () => {
    store(`caster-name-${n}`, nameInput(n).value);
    broadcast();
    syncIngameCasters();
  });

  // links only apply on Enter / leaving the field, so the cam doesn't reload on every keystroke
  linkInput(n)?.addEventListener("change", () => {
    const link = linkInput(n).value.trim();
    const valid = !link || /^https?:\/\//i.test(link);
    linkInput(n).classList.toggle("invalid", !valid);
    if (!valid) return;
    linkInput(n).value = link;
    store(`caster-link-${n}`, link);
    broadcast();
  });
});

// RESET DRAFT wipes localStorage and clears every text input (control.js runs first)
document.getElementById("reset")?.addEventListener("click", render);

// another controller tab in the same browser
window.addEventListener("storage", (e) => {
  if (e.key === null || (e.key && e.key.startsWith("caster-"))) render();
});

render();

function handleRequest(data) {
  if (data?.type === "cams-request") broadcast();
}
channel.addEventListener("message", (e) => handleRequest(e.data));
onMessage(handleRequest);
// OBS CAM SOURCES turned on/off (js/obsWebsocket/camSources.js): tell the pages
window.addEventListener("caster-cams-broadcast", broadcast);
