// Caster cams (controller.html, CASTER CAMS panel; visible in SETUP and LIVE).
// 1 CASTER / 2 CASTERS toggles which caster cams show on display.html; clicking the
// active one again hides them. Each caster has a name and a vdo.ninja view link.
// Names are also written into the INGAME casters field (js/ingame.js), which syncs
// the "NAME | NAME" bar on gameDisplay.html.
//
// localStorage: caster-layout ("" | "1" | "2"), caster-name-1/2, caster-link-1/2
// Message:      { type: "caster-cams", layout, casters: [{ name, link }, { name, link }] }
import { send } from "./websocketClient.js";

const channel = new BroadcastChannel("team_channel");
const SLOTS = [1, 2];

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
    casters: SLOTS.map((n) => ({
      name: localStorage.getItem(`caster-name-${n}`) || "",
      link: localStorage.getItem(`caster-link-${n}`) || "",
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
}

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
