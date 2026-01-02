const bluePickIdentifier = document.querySelector("#triangle-left");
const redPickIdentifier = document.querySelector("#triangle-right");
const progressBar = document.querySelector("#progressFill");
const phaseTexts = document.getElementById("pickOrBan");
let phase = 1;
let reservedPhase;

const threeVisualPhases = [
  // BANNING PHASE 1
  { set: [1, 1, false], remove: null },
  { set: [2, 2, false], remove: [1, 1, false] },
  { set: [3, 3, false], remove: [2, 2, false] },
  { set: [4, 4, false], remove: [3, 3, false] },
  // PICKING PHASE 1
  { set: [1, 1, true, true], remove: [4, 4, false] },
  { set: [2, 3, true, false], remove: [1, 1, true, true] },
  { set: [4, 5, true, true], remove: [2, 3, true, false] },
  { set: [6, 6, true, false], remove: [4, 5, true, true] },
  // BANNING PHASE 2
  { set: [5, 5, false], remove: [6, 6, true, false] },
  { set: [6, 6, false], remove: [5, 5, false] },
  // PICKING PHASE 2
  { set: [7, 7, true, false], remove: [6, 6, false] },
  { set: [8, 9, true, true], remove: [7, 7, true, false] },
  { set: [10, 10, true, false], remove: [8, 9, true, true] },
  { set: null, remove: [10, 10, true, false] }
];

function setVisual(first, last, pick = false, blue = false) {
  for (let i = first; i <= last; i++) {
    if (!pick) {
      const div = document.querySelector(`.ban-${i}`);
      if (div) div.classList.add("bans");
      phaseTexts.textContent = "BANNING";
    } else {
      const div = document.querySelector(`.pick-${i}`);
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

    const current = threeVisualPhases[phaseNumber - 1];
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
    } else if (phaseNumber <= 8) {
      blueOpacity = phaseNumber % 2 ? 1 : 0;
      redOpacity = phaseNumber % 2 ? 0 : 1;
      progressBar.style.background = phaseNumber % 2 ? "blue" : "red";
    } else if (phaseNumber < 14) {
      blueOpacity = phaseNumber % 2 ? 0 : 1;
      redOpacity = phaseNumber % 2 ? 1 : 0;
      progressBar.style.background = phaseNumber % 2 ? "red" : "blue";
    } else if (phaseNumber >= 14) {
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
