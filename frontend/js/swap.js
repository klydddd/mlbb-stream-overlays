// Hero swap (controller): click one team's "swap" button, then another one on the same
// team, and those two players trade heroes. Players, names and photos stay put.
//
// Each swap button sits under a pick input in the same position of the same panel, and
// that input decides the slot (blue panel: pick-1, 4, 5, 8, 9; red: pick-10, 7, 6, 3, 2).
// The button number itself does not match the pick number.
//
// Syncs on all three channels:
//   localStorage: "hero-swap" { slots: [a, b], at } is written first, then heroPick-a/-b.
//     Storage events arrive in write order, so a display in another tab knows these two
//     pick changes are a swap and renders them without voicelines / stats pop-ups.
//   BroadcastChannel + WebSocket: { type: "hero-swap", picks: { [slot]: name, ... } }
import { send } from "./websocketClient.js";

const channel = new BroadcastChannel("team_channel");
let selected = null; // { btn, slot, side }

// map every swap button to the pick input above it (same index, same panel)
function slotFor(btn) {
  const area = btn.closest(".swapping-area");
  const panelBody = area?.closest(".panel-body");
  if (!panelBody) return null;
  const index = [...area.querySelectorAll("button")].indexOf(btn);
  const input = panelBody.querySelectorAll(".picks input")[index];
  const slot = parseInt(input?.id.replace("pick-", ""), 10);
  if (!slot) return null;
  return { slot, side: area.id === "red-swap" ? "red" : "blue" };
}

function clearSelection() {
  selected?.btn.classList.remove("swap-selected");
  selected = null;
}

function swap(slotA, slotB) {
  const inputA = document.getElementById(`pick-${slotA}`);
  const inputB = document.getElementById(`pick-${slotB}`);
  if (!inputA || !inputB) return;

  // localStorage is the source of truth (an input may hold unconfirmed typing)
  const heroA = localStorage.getItem(`heroPick-${slotA}`) || "";
  const heroB = localStorage.getItem(`heroPick-${slotB}`) || "";
  if (heroA === heroB) return;

  inputA.value = heroB;
  inputB.value = heroA;

  localStorage.setItem("hero-swap", JSON.stringify({ slots: [slotA, slotB], at: Date.now() }));
  localStorage.setItem(`heroPick-${slotA}`, heroB);
  localStorage.setItem(`heroPick-${slotB}`, heroA);

  const msg = { type: "hero-swap", picks: { [slotA]: heroB, [slotB]: heroA } };
  channel.postMessage(msg);
  send(msg);
}

document.querySelectorAll(".swapping-area button").forEach((btn) => {
  btn.type = "button";
  btn.addEventListener("click", () => {
    const target = slotFor(btn);
    if (!target) return;

    // first pick, the same button again, or a button on the other team: (re)select
    if (!selected || selected.btn === btn || selected.side !== target.side) {
      const same = selected?.btn === btn;
      clearSelection();
      if (!same) {
        selected = { btn, ...target };
        btn.classList.add("swap-selected");
      }
      return;
    }

    swap(selected.slot, target.slot);
    clearSelection();
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") clearSelection();
});
