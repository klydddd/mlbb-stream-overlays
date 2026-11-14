const bluePickIdentifier = document.querySelector("#triangle-left");
const redPickIdentifier = document.querySelector("#triangle-right");
const progressBar = document.querySelector("#progressFill");
const phaseTexts = document.getElementById("pickOrBan");
let phase = 1;
let reservedPhase;

const fiveVisualPhases = [
  // BANNING PHASE 1
  { set: [1, 1, false], remove: null },
  { set: [2, 2, false], remove: [1, 1, false] },
  { set: [3, 3, false], remove: [2, 2, false] },
  { set: [4, 4, false], remove: [3, 3, false] },
  { set: [5, 5, false], remove: [4, 4, false] },
  { set: [6, 6, false], remove: [5, 5, false] },

  // PICKING PHASE 1
  { set: [1, 1, true, true], remove: [6, 6, false] },
  { set: [2, 3, true, false], remove: [1, 1, true, true] },
  { set: [4, 5, true, true], remove: [2, 3, true, false] },
  { set: [6, 6, true, false], remove: [4, 5, true, true] },
  // BANNING PHASE 2
  { set: [7, 7, false], remove: [6, 6, true, false] },
  { set: [8, 8, false], remove: [7, 7, false] },
  { set: [9, 9, false], remove: [8, 8, false] },
  { set: [10, 10, false], remove: [9, 9, false] },
  // PICKING PHASE 2
  { set: [7, 7, true, false], remove: [10, 10, false] },
  { set: [8, 9, true, true], remove: [7, 7, true, false] },
  { set: [10, 10, true, false], remove: [8, 9, true, true] },
  { set: null, remove: [10, 10, true, false] }
];

// Effect layers for the active pick slot (styled in display.css, shown only while the
// slot has .blue-picks / .red-picks). Added once per slot, on first use: the backdrop
// goes first so it sits under the role icon and player photo, the glow goes last.
function ensurePickFx(div) {
  if (div.querySelector(":scope > .pick-fx-glow")) return;
  const backdrop = document.createElement("div");
  backdrop.className = "pick-fx-backdrop";
  const glow = document.createElement("div");
  glow.className = "pick-fx-glow";
  glow.innerHTML =
    '<i class="pick-fx-base"></i><i class="pick-fx-bloom"></i><i class="pick-fx-edge"></i>' +
    '<i class="pick-fx-sparks-b"></i><i class="pick-fx-sparks-a"></i>';
  div.prepend(backdrop);
  div.append(glow);
}

function setVisual(first, last, pick = false, blue = false) {
  for (let i = first; i <= last; i++) {
    if (!pick) {
      const div = document.querySelector(`.ban-${i}`);
      if (div) div.classList.add("bans");
      phaseTexts.textContent = "BANNING";
    } else {
      const div = document.querySelector(`.pick-${i}`);
      if (div) ensurePickFx(div);
      if (!blue) {
        if (div) div.classList.add("red-picks");
      } else {
        if (div) div.classList.add("blue-picks");
      }
      phaseTexts.textContent = "PICKING";
    }
  }
}

function removeVisual(first, last, pick = false, blue = false) {
  for (let i = first; i <= last; i++) {
    if (!pick) {
      const div = document.querySelector(`.ban-${i}`);
      if (div) div.classList.remove("bans");
    } else {
      const div = document.querySelector(`.pick-${i}`);
      if (!blue) {
        if (div) div.classList.remove("red-picks");
      } else {
        if (div) div.classList.remove("blue-picks");
      }
    }
  }
}

window.addEventListener('storage', (e) => {
  const isPhase = e.key && e.key.startsWith('phase-number');

  if (isPhase) {
    const phaseNumber = parseInt(localStorage.getItem("phase-number"));

    const current = fiveVisualPhases[phaseNumber - 1];
    if (current) {
      if (phase !== 0) {
        if (current.set) setVisual(...current.set);
        if (current.remove) removeVisual(...current.remove);
        phase++;
      } else {
        if (reservedPhase.remove) removeVisual(...reservedPhase.remove);
      }
    }

    let blueOpacity = 1;
    let redOpacity = 1;

    if (phaseNumber === null) {
      phaseTexts.textContent = "DRAFT STARTING SOON";
      reservedPhase = current;
      phase = 0;
    } else if (phaseNumber <= 10) {
      blueOpacity = phaseNumber % 2 ? 1 : 0;
      redOpacity = phaseNumber % 2 ? 0 : 1;
      progressBar.style.background = phaseNumber % 2 ? "blue" : "red";
    } else if (phaseNumber < 18) {
      blueOpacity = phaseNumber % 2 ? 0 : 1;
      redOpacity = phaseNumber % 2 ? 1 : 0;
      progressBar.style.background = phaseNumber % 2 ? "red" : "blue";
    } else if (phaseNumber >= 18) {
      progressBar.style.background = "linear-gradient(90deg, blue, red)";
      phaseTexts.textContent = "FINALIZING DRAFT";
    } else {
      phaseTexts.textContent = "DRAFT STARTING SOON";
    }

    bluePickIdentifier.style.opacity = blueOpacity;
    redPickIdentifier.style.opacity = redOpacity;

    return;
  }
});
