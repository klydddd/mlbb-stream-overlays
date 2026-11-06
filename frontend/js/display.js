import { heroes, updateBanPick, updateHeroPick, updateHeroPickSilent } from "./hero.js";
import { onMessage } from "./websocketClient.js";

const blueName = localStorage.getItem(`blue-team-name`);
const redName = localStorage.getItem(`red-team-name`);
const roundName = document.getElementById('roundName');

const resetText = (id, fallback) => {
  const el = document.getElementById(id);
  if (el) el.textContent = fallback;
};

function handleIncomingMessage(data) {
  switch (data.type) {
    case "switch":
      const blue = document.getElementById("blue-team-name");
      const red = document.getElementById("red-team-name");

      if (blue) blue.textContent = data.blueTeamName || "Blue Team Name";
      if (red) red.textContent = data.redTeamName || "Red Team Name";

      // 1. Swap player names
      for (let i = 1; i <= 10; i++) {
        if (data.names?.[`input-name-${i}`] !== undefined) {
          const name = document.getElementById(`name-${i}`);
          if (name) name.textContent = data.names[`input-name-${i}`] || `Player ${i}`;
        }
      }

      // 2. Swap hero picks (and render portraits silently)
      for (let i = 1; i <= 10; i++) {
        if (data.picks?.[`pick-${i}`] !== undefined) {
          updateHeroPickSilent(i - 1, data.picks[`pick-${i}`]);
        }
      }

      // 3. Swap bans (and render grayscale ban portraits)
      for (let i = 1; i <= 10; i++) {
        if (data.bans?.[`ban-${i}`] !== undefined) {
          updateBanPick(i - 1, data.bans[`ban-${i}`]);
        }
      }
      return;
    case "show-heroes-display":
      // Last phase countdown finished: play the outro, then switch to the lineup screen (same room)
      playOutro(() => {
        window.location.href = "heroes-display.html" + window.location.search;
      });
      return;
    case "reset":
      resetText("blue-team-name", "Blue Team Name");
      resetText("red-team-name", "Red Team Name");

      for (let i = 1; i <= 4; i++) {
        resetText(`team-logo-${i}`, ``);
      }
      document.querySelectorAll("#logo-name-bg").forEach(el => el.textContent = "");

      clearNames();
      clearPicks();
      clearBans();
      clearScores();
      return;
    case "score-update":
      // ADD / DEDUCT SCORE on the controller (js/ingame.js)
      if (data.team === "blue" || data.team === "red") setScore(data.team, data.value);
      return;
    case "clear-names":
      clearNames();
      break;
    case "clear-picks":
      clearPicks();
      break;
    case "clear-bans":
      clearBans();
      break;
    case "clear-scores":
      clearScores();
      break;
    case "clear-cam-links":
      // Nothing to clear on display side for cam links
      break;
    case "ai_prediction":
      // Handle AI hero prediction from the Python multi-scanner bot
      if (data.data && data.data.name) {
        const heroName = data.data.name;
        const slotType = data.data.slot_type; // 'ban' or 'pick'
        const slotIndex = data.data.slot_index; // 1-10 for picks, 1-6 for bans
        const slotName = data.data.slot; // e.g., 'pick-1', 'ban-3'

        if (slotType === 'ban') {
          // Bans: ban-1 to ban-6 map to indices 0-5 (display uses ban-1 to ban-10)
          // ban-1,2,3 are blue side (indices 0,1,2)
          // ban-4,5,6 are red side (indices 5,6,7)
          const banIndexMap = {
            1: 0, 2: 1, 3: 2,  // Blue bans
            4: 5, 5: 6, 6: 7   // Red bans
          };
          const displayIndex = banIndexMap[slotIndex];
          if (displayIndex !== undefined) {
            updateBanPick(displayIndex, heroName);
            console.log(` AI Ban: ${heroName} → ${slotName} (display index ${displayIndex})`);
          }
        } else if (slotType === 'pick') {
          // Picks: pick-1 to pick-10 map directly to indices 0-9
          // pick-1,2,3,4,5 are blue side (indices 0,1,2,3,4)
          // pick-6,7,8,9,10 are red side (indices 5,6,7,8,9)
          const displayIndex = slotIndex - 1; // Convert 1-based to 0-based
          if (displayIndex >= 0 && displayIndex <= 9) {
            updateHeroPick(displayIndex, heroName, false);
            console.log(` AI Pick: ${heroName} → ${slotName} (display index ${displayIndex})`);
          }
        }
      }
      break;
  }

  if (data.blueTeamName !== undefined) {
    const blueDiv = document.getElementById("blue-team-name");
    if (blueDiv) blueDiv.textContent = data.blueTeamName || "Blue Team Name";
  }

  if (data.redTeamName !== undefined) {
    const redDiv = document.getElementById("red-team-name");
    if (redDiv) redDiv.textContent = data.redTeamName || "Red Team Name";
  }

  for (let i = 1; i <= 10; i++) {
    if (data[`pick-${i}`] !== undefined) {
      const heroDiv = document.getElementById(`hero-name-${i}`);
      if (heroDiv) heroDiv.textContent = data[`pick-${i}`] || `Pick ${i}`;
    }
  }

  for (let i = 1; i <= 10; i++) {
    if (data[`input-name-${i}`] !== undefined) {
      const nameDiv = document.getElementById(`name-${i}`);
      if (nameDiv) nameDiv.textContent = data[`input-name-${i}`] || `Player ${i}`;
    }
  }

  if (data.gameNumber !== undefined) {
    const gn = document.getElementById("gameNumber");
    if (gn) gn.textContent = data.gameNumber;
  }

  if (data.matchNumber !== undefined) {
    const mn = document.getElementById("matchNumber");
    if (mn) mn.textContent = data.matchNumber;
  }

  if (data.roundName !== undefined) {
    const rn = document.getElementById("roundName");
    if (rn) rn.textContent = data.roundName;
  }

  // Handle hero picks via WebSocket
if (data.heroPick !== undefined) {
  const { index, name } = data.heroPick;
  updateHeroPick(index - 1, name, false);
}

  // Handle bans via WebSocket
  if (data.banPick !== undefined) {
    const { index, name } = data.banPick;
    updateBanPick(index - 1, name);
  }
}

function initializeHeroNames() {
  for (let i = 1; i <= 10; i++) {
    const heroNameP = document.getElementById(`hero-name-${i}`);
    if (heroNameP && heroNameP.textContent.trim() === '') {
      heroNameP.parentElement.style.opacity = '0';
      heroNameP.parentElement.style.pointerEvents = 'none';
      heroNameP.parentElement.style.height = '0';
      heroNameP.parentElement.style.overflow = 'hidden';
    }
  }
}

function initializeSavedTeamNames() {
  const blueNameDisplay = document.getElementById("blue-team-name");
  blueNameDisplay.innerHTML = blueName;

  const redNameDisplay = document.getElementById("red-team-name");
  redNameDisplay.innerHTML = redName;

  if (blueName === null && redName === null) {
    blueNameDisplay.innerHTML = "BLUE TEAM NAME";
    redNameDisplay.innerHTML = "RED TEAM NAME";
  }
}

function initializeNames() {
  for (let i = 1; i <= 10; i++) {
    const playerNameDisplay = document.getElementById(`name-${i}`);
    const playerName = localStorage.getItem(`player-name-${i}`);
    if (playerName !== null) {
      playerNameDisplay.innerHTML = playerName;
    }
  }
}

function initializeMatchInfo() {
  const gn = document.getElementById("gameNumber");
  const mn = document.getElementById("matchNumber");
  const rn = document.getElementById("roundName");

  const savedGn = localStorage.getItem("game-number");
  const savedMn = localStorage.getItem("match-number");
  const savedRn = localStorage.getItem("round-name");

  if (gn && savedGn) gn.textContent = savedGn;
  if (mn && savedMn) mn.textContent = savedMn;
  if (rn && savedRn) rn.textContent = savedRn;
}

window.addEventListener('DOMContentLoaded', initializeHeroNames);
window.addEventListener('DOMContentLoaded', initializeSavedTeamNames);
window.addEventListener('DOMContentLoaded', initializeNames);
window.addEventListener('DOMContentLoaded', initializeMatchInfo);

const channel = new BroadcastChannel("team_channel");
onMessage(handleIncomingMessage);

// Initial check on page load
for (let i = 0; i < 10; i++) {
  const name = localStorage.getItem(`heroPick-${i + 1}`);
  if (name) updateHeroPickSilent(i, name);
}

for (let i = 0; i < 10; i++) {
  const name = localStorage.getItem(`banPick-${i + 1}`);
  if (name) updateBanPick(i, name);
}

// ---------- Outro (before switching to heroes-display.html) ----------
// No opacity fades on purpose: OBS browser sources composite semi-transparent
// pixels onto a transparent background, which shows light panels as grey and lets
// the dark role icons behind the hero portraits bleed through mid-fade.
// Instead every element slides fully out of its (clipped) section, and the
// remaining panels are wiped away with clip-path. Uses the Web Animations API so
// it doesn't fight the existing glow / shake / float CSS animations.
let outroPlaying = false;

function playOutro(done) {
  if (outroPlaying) return; // message can arrive via both BroadcastChannel and WebSocket
  outroPlaying = true;

  const EASE_OUT = "cubic-bezier(0.55, 0, 0.75, 0.2)";
  const STEP = 45; // ms between elements in a group
  let end = 0;

  const run = (el, keyframes, delay, duration) => {
    el.animate(keyframes, { duration, delay, easing: EASE_OUT, fill: "forwards" });
    end = Math.max(end, delay + duration);
  };

  // Clip each section to its own box so sliding items vanish at the edge.
  // (The name bar gets 20px extra below: names already sit ~15px under it.)
  const CLIP = {
    ".ban-section": ["inset(0 0 0 0)", "inset(0 0 100% 0)"],               // wipe up
    ".pick-section": ["inset(0 0 0 0)", "inset(100% 0 0 0)"],             // wipe down
    ".name-section": ["inset(0 0 -20px 0)", "inset(100% 0 -20px 0)"],      // wipe down
    ".progress-container": ["inset(0 0 0 0)", "inset(100% 0 0 0)"],
  };
  Object.entries(CLIP).forEach(([sel, [from]]) => {
    document.querySelectorAll(sel).forEach((el) => (el.style.clipPath = from));
  });

  // 1. Slide items out of their sections (fully, so nothing is left half-visible)
  const slides = [
    // [selector, translate to, start ms, duration ms]
    [".ban-section .ban-container", "0 -110%", 0, 400],
    [".ban-section .team-name", "0 -110%", 150, 400],
    [".ban-section .match-info", "0 -110%", 150, 400],
    // hero picks and the role icons behind them move in lockstep (same DOM order)
    [".pick-section:not(.pick-section-background) .player-pick", "0 110%", 200, 450],
    [".pick-section-background .media-container", "0 110%", 200, 450],
    [".name-section .name", "0 220%", 300, 400],
    [".name-section .gap > *", "0 220%", 300, 400],
  ];
  slides.forEach(([selector, to, start, duration]) => {
    document.querySelectorAll(selector).forEach((el, i) => {
      run(el, [{ translate: "0 0" }, { translate: to }], start + i * STEP, duration);
    });
  });

  // 2. Timer / match info column collapses upward
  document.querySelectorAll(".pick-section:not(.pick-section-background) > .gap").forEach((el) => {
    run(el, [{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 100% 0)" }], 250, 450);
  });

  // 3. Wipe away the remaining panels / bars
  Object.entries(CLIP).forEach(([sel, [from, to]]) => {
    document.querySelectorAll(sel).forEach((el) => {
      run(el, [{ clipPath: from }, { clipPath: to }], 750, 350);
    });
  });

  setTimeout(done, end + 80);
}

function clearNames() {
  for (let i = 1; i <= 10; i++) {
    resetText(`name-${i}`, `PLAYER ${i}`);
  }
}

function clearPicks() {
  for (let i = 1; i <= 10; i++) {
    resetText(`hero-name-${i}`, "");
    const heroContainer = document.getElementById(`hero-${i}`);
    if (heroContainer) heroContainer.innerHTML = "";
    const bgContainer = document.getElementById(`hero-name-bg-${i}`);
    if (bgContainer) bgContainer.style.width = "0";
  }
}

function clearBans() {
  for (let i = 1; i <= 10; i++) {
    const heroContainer = document.getElementById(`ban-${i}`);
    if (heroContainer) heroContainer.innerHTML = "";
  }
}

// Series score: light up the score boxes (3 per side), filling outward from the
// team-name side: blue left-to-right, red right-to-left. Stored as blue-score / red-score.
function setScore(side, value) {
  const wins = Math.max(0, parseInt(value, 10) || 0);
  const boxes = [...document.querySelectorAll(`.${side}-score .score`)];
  if (side === "red") boxes.reverse();
  boxes.forEach((el, i) => el.classList.toggle("won", i < wins));
}

function clearScores() {
  setScore("blue", 0);
  setScore("red", 0);
}

setScore("blue", localStorage.getItem("blue-score"));
setScore("red", localStorage.getItem("red-score"));

channel.onmessage = (event) => {
  const data = event.data;
  handleIncomingMessage(data);
};

window.addEventListener('storage', (e) => {
  if (e.key === null) clearScores(); // localStorage.clear() from RESET DRAFT
  if (e.key === 'blue-score' || e.key === 'red-score') {
    setScore(e.key.split('-')[0], e.newValue);
    return;
  }

  const isHeroPick = e.key && e.key.startsWith('heroPick-');
  const isBanPick = e.key && e.key.startsWith('banPick-');
  const isRoundName = e.key && e.key.startsWith('round-name');

  if (isBanPick) {
    const index = parseInt(e.key.split('-')[1]) - 1;
    updateBanPick(index, e.newValue);
    return;
  }

  if (isHeroPick) {
    const index = parseInt(e.key.split('-')[1]) - 1;
    const isFinalPhase = localStorage.getItem('phase-number') === '18';

    if (isFinalPhase) {
      updateHeroPickSilent(index, e.newValue);
    } else {
      updateHeroPick(index, e.newValue, false);
    }
  }

  if (isRoundName) {
    roundName.textContent = localStorage.getItem('round-name');
  }

  if (e.key === 'game-number') {
    const gn = document.getElementById("gameNumber");
    if (gn) gn.textContent = e.newValue;
  }

  if (e.key === 'match-number') {
    const mn = document.getElementById("matchNumber");
    if (mn) mn.textContent = e.newValue;
  }
});
