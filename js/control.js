import { send } from "./websocketClient.js";

const page = document.body.getAttribute("data-page"); // to determine which page is display and controller
const channel = new BroadcastChannel("team_channel");

const switchBtn = document.getElementById("switch");
const menu = document.getElementById('customMenu');
const toggle = document.getElementById('menuToggle');
const options = menu.querySelectorAll('.menu-options div');
const matchNumberInput = document.getElementById('matchNumberInput');
const gameNumberInput = document.getElementById('gameNumberInput');

// Round Name Dropdown
toggle.addEventListener('click', () => {
  menu.classList.toggle('active');
});

options.forEach(option => {
  option.addEventListener('click', () => {
    const selectedRound = option.textContent;
    toggle.textContent = selectedRound;
    menu.classList.remove('active');
    localStorage.setItem('round-name', selectedRound);
    channel.postMessage({ roundName: selectedRound });
    send({ roundName: selectedRound });
  });
});

document.addEventListener('click', (e) => {
  if (!menu.contains(e.target)) {
    menu.classList.remove('active');
  }
});

// Switch Function Logic
if (switchBtn) {
  switchBtn.addEventListener("click", () => {
    // 1. Team Names
    const blueTeamInput = document.getElementById("blueTeamName");
    const redTeamInput = document.getElementById("redTeamName");
    const blueTeamName = blueTeamInput?.value ?? "";
    const redTeamName = redTeamInput?.value ?? "";

    // 2. Team Logos
    const logoBlue = localStorage.getItem("logo-blue");
    const logoRed = localStorage.getItem("logo-red");

    // 3. Team Cam Links
    const teamCam1Input = document.getElementById("team-cam-link-1");
    const teamCam2Input = document.getElementById("team-cam-link-2");
    const teamCam1 = teamCam1Input?.value ?? "";
    const teamCam2 = teamCam2Input?.value ?? "";

    // 4. Individual Player Cam Links
    const cams = {};
    for (let i = 1; i <= 10; i++) {
      const camInput = document.getElementById(`cam-${i}`);
      cams[`cam-${i}`] = camInput?.value ?? "";
    }

    // 5. Player Names
    const names = {};
    for (let i = 1; i <= 10; i++) {
      const nameInput = document.getElementById(`input-name-${i}`);
      names[`input-name-${i}`] = nameInput?.value ?? "";
    }

    // 6. Player Picks
    const picks = {};
    for (let i = 1; i <= 10; i++) {
      const pickInput = document.getElementById(`pick-${i}`);
      picks[`pick-${i}`] = pickInput?.value ?? "";
    }

    // 7. Player Bans
    const bans = {};
    for (let i = 1; i <= 10; i++) {
      const banInput = document.getElementById(`ban-${i}`);
      bans[`ban-${i}`] = banInput?.value ?? "";
    }

    // --- SWAP & SAVE TO LOCALSTORAGE / UPDATE CONTROLLER UI ---

    // 1. Swap Team Names
    if (blueTeamInput && redTeamInput) {
      blueTeamInput.value = redTeamName;
      redTeamInput.value = blueTeamName;
      localStorage.setItem("blue-team-name", redTeamName);
      localStorage.setItem("red-team-name", blueTeamName);
    }

    // 2. Swap Team Logos
    if (logoRed) {
      localStorage.setItem("logo-blue", logoRed);
    } else {
      localStorage.removeItem("logo-blue");
    }
    if (logoBlue) {
      localStorage.setItem("logo-red", logoBlue);
    } else {
      localStorage.removeItem("logo-red");
    }

    // 3. Swap Team Cam Links
    if (teamCam1Input && teamCam2Input) {
      teamCam1Input.value = teamCam2;
      teamCam2Input.value = teamCam1;
      localStorage.setItem("team-cam-link-1", teamCam2);
      localStorage.setItem("team-cam-link-2", teamCam1);
    }

    // 4. Swap Individual Player Cam Links
    for (let i = 1; i <= 5; i++) {
      const camBlue = document.getElementById(`cam-${i}`);
      const camRed = document.getElementById(`cam-${i + 5}`);
      if (camBlue && camRed) {
        camBlue.value = cams[`cam-${i + 5}`];
        camRed.value = cams[`cam-${i}`];
        localStorage.setItem(`camera-link-${i}`, cams[`cam-${i + 5}`]);
        localStorage.setItem(`camera-link-${i + 5}`, cams[`cam-${i}`]);
      }
    }

    // 5. Swap Player Names
    for (let i = 1; i <= 5; i++) {
      const nameBlue = document.getElementById(`input-name-${i}`);
      const nameRed = document.getElementById(`input-name-${i + 5}`);
      if (nameBlue && nameRed) {
        nameBlue.value = names[`input-name-${i + 5}`];
        nameRed.value = names[`input-name-${i}`];
        localStorage.setItem(`player-name-${i}`, names[`input-name-${i + 5}`]);
        localStorage.setItem(`player-name-${i + 5}`, names[`input-name-${i}`]);
      }
    }

    // 6. Swap Player Picks (IDs follow draft order, not positional)
    const bluePickIds = [1, 4, 5, 8, 9];
    const redPickIds  = [2, 3, 6, 7, 10];
    for (let idx = 0; idx < 5; idx++) {
      const bId = bluePickIds[idx];
      const rId = redPickIds[idx];
      const pickBlue = document.getElementById(`pick-${bId}`);
      const pickRed = document.getElementById(`pick-${rId}`);
      if (pickBlue && pickRed) {
        pickBlue.value = picks[`pick-${rId}`];
        pickRed.value = picks[`pick-${bId}`];
        localStorage.setItem(`heroPick-${bId}`, picks[`pick-${rId}`]);
        localStorage.setItem(`heroPick-${rId}`, picks[`pick-${bId}`]);
      }
    }

    // 7. Swap Player Bans (IDs follow draft order, not positional)
    const blueBanIds = [1, 3, 5, 8, 10];
    const redBanIds  = [2, 4, 6, 7, 9];
    for (let idx = 0; idx < 5; idx++) {
      const bId = blueBanIds[idx];
      const rId = redBanIds[idx];
      const banBlue = document.getElementById(`ban-${bId}`);
      const banRed = document.getElementById(`ban-${rId}`);
      if (banBlue && banRed) {
        banBlue.value = bans[`ban-${rId}`];
        banRed.value = bans[`ban-${bId}`];
        localStorage.setItem(`banPick-${bId}`, bans[`ban-${rId}`]);
        localStorage.setItem(`banPick-${rId}`, bans[`ban-${bId}`]);
      }
    }

    // --- PREPARE SWAPPED DATA FOR BROADCAST & REMOTE SYNC ---
    const swappedPicks = {};
    const swappedNames = {};
    const swappedBans = {};

    for (let i = 1; i <= 10; i++) {
      const pickInput = document.getElementById(`pick-${i}`);
      const nameInput = document.getElementById(`input-name-${i}`);
      const banInput = document.getElementById(`ban-${i}`);
      if (pickInput) swappedPicks[`pick-${i}`] = pickInput.value;
      if (nameInput) swappedNames[`input-name-${i}`] = nameInput.value;
      if (banInput) swappedBans[`ban-${i}`] = banInput.value;
    }

    const switchPayload = {
      type: "switch",
      blueTeamName: redTeamName,
      redTeamName: blueTeamName,
      picks: swappedPicks,
      names: swappedNames,
      bans: swappedBans
    };

    // Broadcast team switch
    channel.postMessage(switchPayload);
    send(switchPayload);

    // Broadcast logo updates to sync display logo changes
    channel.postMessage({ type: "logo-update", team: "blue", data: logoRed });
    channel.postMessage({ type: "logo-update", team: "red", data: logoBlue });
    send({ type: "logo-update", team: "blue", data: logoRed });
    send({ type: "logo-update", team: "red", data: logoBlue });
  });
}

// Reset button logic
const resetBtn = document.getElementById("reset");

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    document.querySelectorAll("input[type='text']").forEach(input => input.value = "");
    document.querySelectorAll("input[type='image']").forEach(img => {
      img.src = "default.png";
    });
    document.querySelectorAll(".media-container").forEach(container => {
      container.innerHTML = "";
    });

    localStorage.clear();
    channel.postMessage({ type: "reset" });
    send({ type: "reset" });

    document.querySelectorAll(".hero-name").forEach(container => {
      container.innerHTML = "";
    });
    document.querySelectorAll(".team-logo").forEach(container => {
      container.innerHTML = "";
    });
  });
}

// Blue Team Name
const blueInput = document.getElementById("blueTeamName");
if (blueInput) {
  blueInput.addEventListener("input", () => {
    localStorage.setItem(`blue-team-name`, blueInput.value);
    channel.postMessage({ blueTeamName: blueInput.value });
    send({ blueTeamName: blueInput.value });
  });
}

// Red Team Name
const redInput = document.getElementById("redTeamName");
if (redInput) {
  redInput.addEventListener("input", () => {
    localStorage.setItem(`red-team-name`, redInput.value);
    channel.postMessage({ redTeamName: redInput.value });
    send({ redTeamName: redInput.value });
  });
}

// Pick inputs
const pickInputs = [...Array(10)].map((_, i) => document.getElementById(`pick-${i + 1}`));
pickInputs.forEach((input, index) => {
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === "Enter") {
        localStorage.setItem(`heroPick-${index + 1}`, input.value.trim());
        send({
          heroPick: {
            index: index + 1,
            name: input.value.trim()
          }
        })
      }
    });
  }
});

// Ban inputs
const banInputs = [...Array(10)].map((_, i) => document.getElementById(`ban-${i + 1}`));
banInputs.forEach((input, index) => {
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === "Enter") {
        localStorage.setItem(`banPick-${index + 1}`, input.value.trim());
        send({
          banPick: {
            index: index + 1,
            name: input.value.trim()
          }
        })
      }
    });
  }
});

// Name inputs
const nameInputs = [...Array(10)].map((_, i) => document.getElementById(`input-name-${i + 1}`));
nameInputs.forEach((input, index) => {
  if (input) {
    input.addEventListener("input", () => {
      channel.postMessage({ [`input-name-${index + 1}`]: input.value });
      send({ [`input-name-${index + 1}`]: input.value });
      localStorage.setItem(`player-name-${index + 1}`, input.value.trim());
    });
  }
});

// Camera link inputs
const camInputs = [...Array(10)].map((_, i) => document.getElementById(`cam-${i + 1}`));
camInputs.forEach((input, index) => {
  if (input) {
    input.addEventListener("input", () => {
      localStorage.setItem(`camera-link-${index + 1}`, input.value.trim());
    });
  }
});

// Team camera inputs
const teamCamInputs = [...Array(2)].map((_, i) => document.getElementById(`team-cam-link-${i + 1}`));
teamCamInputs.forEach((input, index) => {
  if (input) {
    input.addEventListener("input", () => {
      localStorage.setItem(`team-cam-link-${index + 1}`, input.value.trim());
    });
  }
});

// Match Info Inputs
if (gameNumberInput) {
  gameNumberInput.addEventListener("input", () => {
    localStorage.setItem("game-number", gameNumberInput.value);
    channel.postMessage({ gameNumber: gameNumberInput.value });
    send({ gameNumber: gameNumberInput.value });
  });
}

if (matchNumberInput) {
  matchNumberInput.addEventListener("input", () => {
    localStorage.setItem("match-number", matchNumberInput.value);
    channel.postMessage({ matchNumber: matchNumberInput.value });
    send({ matchNumber: matchNumberInput.value });
  });
}

// Load saved values on startup
function initController() {
  const blueInput = document.getElementById("blueTeamName");
  const redInput = document.getElementById("redTeamName");
  if (blueInput) blueInput.value = localStorage.getItem("blue-team-name") || "";
  if (redInput) redInput.value = localStorage.getItem("red-team-name") || "";

  const teamCam1 = document.getElementById("team-cam-link-1");
  const teamCam2 = document.getElementById("team-cam-link-2");
  if (teamCam1) teamCam1.value = localStorage.getItem("team-cam-link-1") || "";
  if (teamCam2) teamCam2.value = localStorage.getItem("team-cam-link-2") || "";

  for (let i = 1; i <= 10; i++) {
    const pickInput = document.getElementById(`pick-${i}`);
    if (pickInput) pickInput.value = localStorage.getItem(`heroPick-${i}`) || "";

    const nameInput = document.getElementById(`input-name-${i}`);
    if (nameInput) nameInput.value = localStorage.getItem(`player-name-${i}`) || "";

    const camInput = document.getElementById(`cam-${i}`);
    if (camInput) camInput.value = localStorage.getItem(`camera-link-${i}`) || "";

    const banInput = document.getElementById(`ban-${i}`);
    if (banInput) banInput.value = localStorage.getItem(`banPick-${i}`) || "";
  }

  if (gameNumberInput) gameNumberInput.value = localStorage.getItem("game-number") || "";
  if (matchNumberInput) matchNumberInput.value = localStorage.getItem("match-number") || "";
  if (toggle) {
    const savedRound = localStorage.getItem("round-name");
    if (savedRound) toggle.textContent = savedRound;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initController);
} else {
  initController();
}
