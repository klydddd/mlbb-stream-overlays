import { heroes, updateBanPick, updateHeroPick, updateHeroPickSilent } from "./hero.js";

const blueName = localStorage.getItem(`blue-team-name`);
const redName = localStorage.getItem(`red-team-name`);
const roundName = document.getElementById('roundName');

const resetText = (id, fallback) => {
  const el = document.getElementById(id);
  if (el) el.textContent = fallback;
};

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

window.addEventListener('DOMContentLoaded', initializeHeroNames);
window.addEventListener('DOMContentLoaded', initializeSavedTeamNames);
window.addEventListener('DOMContentLoaded', initializeNames);

const channel = new BroadcastChannel("team_channel");

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

channel.onmessage = (event) => {
  const data = event.data;

  if (data.type === "switch") {
    const blue = document.getElementById("blue-team-name");
    const red = document.getElementById("red-team-name");

    if (blue) blue.textContent = data.blueTeamName || "Blue Team Name";
    if (red) red.textContent = data.redTeamName || "Red Team Name";

    for (let i = 1; i <= 10; i++) {
      if (data.picks?.[`pick-${i}`] !== undefined) {
        const hero = document.getElementById(`hero-name-${i}`);
        if (hero) hero.textContent = data.picks[`pick-${i}`] || `Pick ${i}`;
      }
    }

    for (let i = 1; i <= 10; i++) {
      if (data.names?.[`input-name-${i}`] !== undefined) {
        const name = document.getElementById(`name-${i}`);
        if (name) name.textContent = data.names[`input-name-${i}`] || `Player ${i}`;
      }
    }
    return;
  }

  if (data.type === "reset") {
    resetText("blue-team-name", "Blue Team Name");
    resetText("red-team-name", "Red Team Name");

    for (let i = 1; i <= 4; i++) {
      resetText(`team-logo-${i}`, ``);
    }

    clearNames();
    clearPicks();
    clearBans();
    return;
  }

  switch (data.type) {
    case "clear-names":
      clearNames();
      break;
    case "clear-picks":
      clearPicks();
      break;
    case "clear-bans":
      clearBans();
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
    const isFinalPhase = localStorage.getItem('phase-number') === '14';

    if (isFinalPhase) {
      updateHeroPickSilent(index, e.newValue);
    } else {
      updateHeroPick(index, e.newValue, false);
    }
  }

  if (isRoundName) {
    roundName.textContent = localStorage.getItem('round-name');
  }
});
