// Controller UI for the one-hero-per-draft rule (js/draftRules.js).
// When a taken hero is entered, nothing is saved or sent to the display: the input goes back to
// what the slot had, flashes red, and a short message names the hero.
import { isTaken } from "./draftRules.js";

const getItem = (k) => localStorage.getItem(k);

export function heroIsTaken(name, slotKey) {
  return isTaken(getItem, name, slotKey);
}

let toastTimer = null;
function toast(text) {
  let el = document.getElementById("draft-guard-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "draft-guard-toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.className = "stats-toast warn show"; // shares the toast style in css/controller.css
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

export function rejectTakenHero(input, slotKey, name) {
  input.value = getItem(slotKey) || "";
  input.classList.remove("slot-taken");
  void input.offsetWidth; // restart the flash if it's already running
  input.classList.add("slot-taken");
  setTimeout(() => input.classList.remove("slot-taken"), 900);
  toast(`${name.trim().toUpperCase()} IS ALREADY PICKED OR BANNED`);
}
