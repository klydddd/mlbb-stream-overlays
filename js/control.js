const page = document.body.getAttribute("data-page"); // to determine which page is display and controller
const channel = new BroadcastChannel("team_channel");

// const silentSwapKeys = new Set();
// const overlayWindow = window.open('display.html', 'OverlayWindow');

const switchBtn = document.getElementById("switch");

// Switch Function Logic
if (switchBtn) {
switchBtn.addEventListener("click", () => {
    // 1. Team names
    const blueTeamInput = document.getElementById("blueTeamName");
    const redTeamInput = document.getElementById("redTeamName");

    const blueTeamName = blueTeamInput?.value ?? "";
    const redTeamName = redTeamInput?.value ?? "";

    // 2. Store picks and names first (to avoid overwriting before reading)
    const picks = {};
    const names = {};

    for (let i = 1; i <= 5; i++) {
    const pickBlue = document.getElementById(`pick-${i}`);
    const pickRed = document.getElementById(`pick-${i + 5}`);
    const nameBlue = document.getElementById(`input-name-${i}`);
    const nameRed = document.getElementById(`input-name-${i + 5}`);

    // add heroPick swap later

    picks[`pick-${i}`] = pickBlue?.value ?? "";
    picks[`pick-${i + 5}`] = pickRed?.value ?? "";

    names[`input-name-${i}`] = nameBlue?.value ?? "";
    names[`input-name-${i + 5}`] = nameRed?.value ?? "";
    }

    // 3. Now perform the swap
    for (let i = 1; i <= 5; i++) {
    const pickBlue = document.getElementById(`pick-${i}`);
    const pickRed = document.getElementById(`pick-${i + 5}`);
    const nameBlue = document.getElementById(`input-name-${i}`);
    const nameRed = document.getElementById(`input-name-${i + 5}`);

    if (pickBlue && pickRed) {
        pickBlue.value = picks[`pick-${i + 5}`];
        localStorage.setItem(`heroPick-${i}`, picks[`pick-${i + 5}`])
        pickRed.value = picks[`pick-${i}`];
        localStorage.setItem(`heroPick-${i + 5}`, picks[`pick-${i}`])
    }

    if (nameBlue && nameRed) {
        nameBlue.value = names[`input-name-${i + 5}`];
        nameRed.value = names[`input-name-${i}`];
    }
    }

    // 4. Send updated values to overlay
    // 4. Build fresh values from DOM after swap
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

    
    // Picks
    for (let i = 1; i <= 10; i++) {
      const pick = swappedPicks[`pick-${i}`];
      const hero = document.getElementById(`hero-name-${i}`);
      if (hero) {
        hero.textContent = pick || `Pick ${i}`;
      }
    }


    // 5. Finally, swap team name inputs
    if (blueTeamInput && redTeamInput) {
    blueTeamInput.value = redTeamName;
    redTeamInput.value = blueTeamName; 
    }
  });

  

}

// Reset button logic (CLEAR ALL INPUTS)
const resetBtn = document.getElementById("reset");

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    // 1. Clear all text input fields
    document.querySelectorAll("input[type='text']").forEach(input => input.value = "");

    // 2. Reset all image inputs to a default image
    document.querySelectorAll("input[type='image']").forEach(img => {
      img.src = "default.png"; // replace with your fallback image path
    });

    // 3. Clear all media-container content
    document.querySelectorAll(".media-container").forEach(container => {
      container.innerHTML = "";
    });

    // 4. Clear localStorage (if you're using it)
    for (let i = 1; i <= 10; i++) {
      localStorage.clear();
    }

    // 5. Broadcast a reset message to index.html
    channel.postMessage({ type: "reset" });

    document.querySelectorAll(".hero-name").forEach(container => {
        container.innerHTML = "";
    })

    document.querySelectorAll(".team-logo").forEach(container => {
      container.innerHTML = "";
    })
  });

    // 6. Clear Logos 

}

// 🔵 Blue Team
const blueInput = document.getElementById("blueTeamName");
if (blueInput) {
  blueInput.addEventListener("input", () => {
        localStorage.setItem(`blue-team-name`, blueInput.value);
        const blueName = localStorage.getItem(`blue-team-name`);
        channel.postMessage({ blueTeamName: blueName });
  });
}

// 🔴 Red Team
const redInput = document.getElementById("redTeamName");
if (redInput) {
  redInput.addEventListener("input", () => {
    localStorage.setItem(`red-team-name`, redInput.value);
    const redName = localStorage.getItem(`red-team-name`);
    channel.postMessage({ redTeamName: redName });
  });
}

// 🟨 Picks (pick-1 to pick-10)
for (let i = 1; i <= 10; i++) {
  const pickInput = document.getElementById(`pick-${i}`);

  const pickInputs = [...Array(10)].map((_, i) => document.getElementById(`pick-${i + 1}`));

  pickInputs.forEach((input, index) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === "Enter") {
          localStorage.setItem(`heroPick-${index + 1}`, input.value.trim());
    }
  });
  });
}

for (let i = 1; i <= 10; i++) {
  const banInput = document.getElementById(`ban-${i}`);
  
  const inputs = [...Array(10)].map((_, i) => document.getElementById(`ban-${i + 1}`));
  
  // Bans (ban-1 to ban-10)
  inputs.forEach((input, index) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === "Enter") {
        localStorage.setItem(`banPick-${index + 1}`, input.value.trim());
      }
    });
  });
}

// 🟦 Names (input-name-1 to input-name-10)
for (let i = 1; i <= 10; i++) {
  const nameInput = document.getElementById(`input-name-${i}`);
  const inputs = [...Array(10)].map((_, i) => document.getElementById(`input-name-${i + 1}`));
  
  if (nameInput) {
    nameInput.addEventListener("input", () => {
      channel.postMessage({ [`input-name-${i}`]: nameInput.value });
      
    });
  }

  inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      localStorage.setItem(`player-name-${index + 1}`, input.value.trim());
    })
  });
}

// Player Camera Links (storing to a localStorage for later use) 
for (let i = 1; i <= 10; i++) {
  const inputs = [...Array(10)].map((_, i) => document.getElementById(`cam-${i + 1}`));

  inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      localStorage.setItem(`camera-link-${index + 1}`, input.value.trim());
    })
  });
  
}

// Team Camera 

for (let i = 1; i <= 2; i++) {
  const inputs = [...Array(2)].map((_, i) => document.getElementById(`team-cam-link-${i + 1}`));

  inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      localStorage.setItem(`team-cam-link-${index + 1}`, input.value.trim());
    })
  });
}


