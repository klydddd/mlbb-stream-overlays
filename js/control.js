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
    toggle.textContent = option.textContent;
    menu.classList.remove('active');
    localStorage.setItem('round-name', option.textContent);
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
    const blueTeamInput = document.getElementById("blueTeamName");
    const redTeamInput = document.getElementById("redTeamName");

    const blueTeamName = blueTeamInput?.value ?? "";
    const redTeamName = redTeamInput?.value ?? "";

    const picks = {};
    const names = {};

    for (let i = 1; i <= 5; i++) {
      const pickBlue = document.getElementById(`pick-${i}`);
      const pickRed = document.getElementById(`pick-${i + 5}`);
      const nameBlue = document.getElementById(`input-name-${i}`);
      const nameRed = document.getElementById(`input-name-${i + 5}`);

      picks[`pick-${i}`] = pickBlue?.value ?? "";
      picks[`pick-${i + 5}`] = pickRed?.value ?? "";
      names[`input-name-${i}`] = nameBlue?.value ?? "";
      names[`input-name-${i + 5}`] = nameRed?.value ?? "";
    }

    for (let i = 1; i <= 5; i++) {
      const pickBlue = document.getElementById(`pick-${i}`);
      const pickRed = document.getElementById(`pick-${i + 5}`);
      const nameBlue = document.getElementById(`input-name-${i}`);
      const nameRed = document.getElementById(`input-name-${i + 5}`);

      if (pickBlue && pickRed) {
        pickBlue.value = picks[`pick-${i + 5}`];
        localStorage.setItem(`heroPick-${i}`, picks[`pick-${i + 5}`]);
        pickRed.value = picks[`pick-${i}`];
        localStorage.setItem(`heroPick-${i + 5}`, picks[`pick-${i}`]);
      }

      if (nameBlue && nameRed) {
        nameBlue.value = names[`input-name-${i + 5}`];
        nameRed.value = names[`input-name-${i}`];
      }
    }

    const swappedPicks = {};
    const swappedNames = {};

    for (let i = 1; i <= 10; i++) {
      const pickInput = document.getElementById(`pick-${i}`);
      const nameInput = document.getElementById(`input-name-${i}`);
      if (pickInput) swappedPicks[`pick-${i}`] = pickInput.value;
      if (nameInput) swappedNames[`input-name-${i}`] = nameInput.value;
    }

    channel.postMessage({
      type: "switch",
      blueTeamName: redTeamName,
      redTeamName: blueTeamName,
      picks: swappedPicks,
      names: swappedNames
    });

    send({
      type: "switch",
      blueTeamName: redTeamName,
      redTeamName: blueTeamName,
      picks: swappedPicks,
      names: swappedNames
    });

    for (let i = 1; i <= 10; i++) {
      const pick = swappedPicks[`pick-${i}`];
      const hero = document.getElementById(`hero-name-${i}`);
      if (hero) {
        hero.textContent = pick || `Pick ${i}`;
      }
    }

    if (blueTeamInput && redTeamInput) {
      blueTeamInput.value = redTeamName;
      redTeamInput.value = blueTeamName;
    }
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
