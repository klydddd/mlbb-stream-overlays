const bluePickIdentifier = document.querySelector("#triangle-left");
const redPickIdentifier = document.querySelector("#triangle-right");
const progressBar = document.querySelector("#progressFill");
const phaseTexts = document.getElementById("pickOrBan");
let phase = 1;
let reservedPhase;

// Define visual phase ranges
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

// Define visual phase ranges
const fiveVisualPhases = [
  // BANNING PHASE 1
  { set: [1, 1, false], remove: null },      
  { set: [2, 2, false], remove: [1, 1, false] },    
  { set: [3, 3, false], remove: [2, 2, false] },    
  { set: [4, 4, false], remove: [3, 3, false] },
  { set: [6, 6, false], remove: [4, 4, false] },
  { set: [5, 5, false], remove: [6, 6, false] },    
  // PICKING PHASE 1
  { set: [1, 1, true, false], remove: [5, 5, false] },    
  { set: [2, 3, true, true], remove: [1, 1, true] },
  { set: [4, 5, true], remove: [2, 3, true] },    
  { set: [6, 6, true], remove: [4, 5, true] },  
  // BANNING PHASE 2
  { set: [7, 7, false], remove: [6, 6, true] },    
  { set: [8, 8, false], remove: [7, 7, false] },
  { set: [9, 9, false], remove: [8, 8, false] },    
  { set: [10, 10, false], remove: [9, 9, false] },
  // PICKING PHASE 2
  { set: [7, 7, true], remove: [10, 10, false] },    
  { set: [8, 9, true], remove: [7, 7, true] },
  { set: [10, 10, true], remove: [8, 9, true] },
  { set: null, remove: [10, 10, true] }
];


function setVisual(first, last, pick = false, blue = false) {
  for (let i = first; i <= last; i++) {
    if (!pick) {
      const div = document.querySelector(`.ban-${i}`);
      if (div) div.classList.add("bans");
      console.log("BAN");
      phaseTexts.textContent = "BANNING";
    } else {
      const div = document.querySelector(`.pick-${i}`);
      if (!blue) {
        if (div) div.classList.add("red-picks");
      } else {
        if (div) div.classList.add("blue-picks");
      }
      phaseTexts.textContent = "PICKING";
      console.log("PICK");
    }
  }
}

function removeVisual(first, last, pick = false, blue = false) {
    for (let i = first; i <= last; i++) {
    if (!pick) {
      const div = document.querySelector(`.ban-${i}`);
      if (div) div.classList.remove("bans");
      console.log("BAN");
    } else {
      const div = document.querySelector(`.pick-${i}`);
      if (!blue) {
        if (div) div.classList.remove("red-picks");
      } else {
        if (div) div.classList.remove("blue-picks");
      }
      console.log("PICK");
    }
  }
}

function removeVisualBanAndPick() {
  for (let i = 1; i <= 10; i++) {
     const ban = document.querySelector(`.ban-${i}`);
     const pick = document.querySelector(`.pick-${i}`);
     if (ban) ban.classList.remove(ban.classList[pick.classList.length - 1]);
     if (pick) pick.classList.remove(pick.classList[pick.classList.length - 1]);
  }
}



// Checks changes in phase-number
window.addEventListener('storage', (e) => {
  const isPhase = e.key && e.key.startsWith('phase-number');
  
  // ✅ Always respond to ban picks
  if (isPhase) {


    const phaseNumber = parseInt(localStorage.getItem("phase-number"));
    
    console.log("Storage event:", phaseNumber);

    const current = threeVisualPhases[phaseNumber - 1];
    if (current) {
      if ( phase !== 0) {
        if (current.set) setVisual(...current.set);
        if (current.remove) removeVisual(...current.remove);
        phase++; 
        
      } else {
        if (reservedPhase.remove) removeVisual(...reservedPhase.remove);
      }
    }


    // Default both visible
    let blueOpacity = 1;
    let redOpacity = 1;
    
    if (phaseNumber === null) {
        // Keep defaults (both visible)
        phaseTexts.textContent = "DRAFT STARTING SOON";
        reservedPhase = current;
        phase = 0;
        
    } else if (phaseNumber <= 8) {
        
        // Even: red visible, odd: blue visible
        blueOpacity = phaseNumber % 2 ? 1 : 0;
        redOpacity = phaseNumber % 2 ? 0 : 1;
        progressBar.style.background = phaseNumber % 2 ? "blue" : "red";        
    } else if (phaseNumber < 14) {
        // Even: blue visible, odd: red visible (inverse of above)
        blueOpacity = phaseNumber % 2 ? 0 : 1;
        redOpacity = phaseNumber % 2 ? 1 : 0;
        progressBar.style.background = phaseNumber % 2 ? "red" : "blue";
    } else if (phaseNumber >= 14){
      progressBar.style.background = "linear-gradient(90deg, blue, red)";
      phaseTexts.textContent = "FINALIZING DRAFT";
    } else {
      phaseTexts.textContent = "DRAFT STARTING SOON";
    }
    // For phaseNumber >= 14, keep defaults (both visible)
    bluePickIdentifier.style.opacity = blueOpacity;
    redPickIdentifier.style.opacity = redOpacity;
    
    
    return;
}

});
