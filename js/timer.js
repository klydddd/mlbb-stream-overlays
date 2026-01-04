// DOM elements
const startBtn = document.getElementById('startBtn');
const resetPhaseBtn = document.getElementById('resetPhase');
const nextPhaseBtn = document.getElementById('nextPhaseBtn');
const currentPhaseDisplay = document.getElementById('currentPhase');

// Draft state
let draftState = {
    isRunning: true, // Changed to true by default for auto-start
    currentPhase: 0,
    timeRemaining: 50,
    phaseChanged: false
};

// Initialize from localStorage if available
function loadState() {
    const savedState = localStorage.getItem('draftState');
    if (savedState) {
        draftState = JSON.parse(savedState);
        currentPhaseDisplay.textContent = draftState.currentPhase;
    }
}

// Save state to localStorage
function saveState() {
    draftState.phaseChanged = true;
    localStorage.setItem('draftState', JSON.stringify(draftState));
    localStorage.setItem('draftUpdate', Date.now().toString());
    setTimeout(() => {
        draftState.phaseChanged = false;
        localStorage.setItem('draftState', JSON.stringify(draftState));
    }, 100);
}

// Start the draft
startBtn.addEventListener('click', () => {
    if (draftState.currentPhase === 0) {
        draftState.currentPhase = 1;
        localStorage.setItem(`phase-number`, 1);
    }
    draftState.isRunning = true;
    draftState.timeRemaining = 50;
    saveState();
    currentPhaseDisplay.textContent = draftState.currentPhase;
});

// Reset the draft
resetPhaseBtn.addEventListener('click', () => {
    draftState.isRunning = false;
    draftState.currentPhase = 0;
    draftState.timeRemaining = 50;
    localStorage.removeItem(`phase-number`);
    saveState();
    currentPhaseDisplay.textContent = draftState.currentPhase;
});

const currentPhaseWrapper = document.getElementById("phaseInfo");

// Move to next phase (now auto-starts timer)
nextPhaseBtn.addEventListener('click', () => {
    if (draftState.currentPhase < 14) {
        draftState.currentPhase++;
        localStorage.setItem(`phase-number`, draftState.currentPhase);
        draftState.isRunning = true; // Auto-start the timer
        draftState.timeRemaining = 50;
        saveState();
        currentPhaseDisplay.textContent = draftState.currentPhase;
    } else {
        alert("Draft completed!");
    }

    if (draftState.currentPhase === 14) {
        alert("Draft completed! Finaize Comps");

    }
});

// Initialize
loadState();
