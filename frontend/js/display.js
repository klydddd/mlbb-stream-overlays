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

function clearScores() {
  document.querySelectorAll(".blue-score .score, .red-score .score").forEach(el => {
    el.className = "score";
    el.innerHTML = "";
  });
}

channel.onmessage = (event) => {
  const data = event.data;
  handleIncomingMessage(data);
};

window.addEventListener('storage', (e) => {
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
