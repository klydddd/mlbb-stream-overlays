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

// ===== AUTO-ADVANCE FEATURE =====
// Phase-to-input mapping (mirrors fiveVisualPhases from activePick.js)
// Each key is the 1-indexed phase number; value is the array of controller input selectors.
const phaseInputMap = {
    1:  ["#ban-1"],
    2:  ["#ban-2"],
    3:  ["#ban-3"],
    4:  ["#ban-4"],
    5:  ["#ban-5"],
    6:  ["#ban-6"],
    7:  ["#pick-1"],
    8:  ["#pick-2", "#pick-3"],
    9:  ["#pick-4", "#pick-5"],
    10: ["#pick-6"],
    11: ["#ban-7"],
    12: ["#ban-8"],
    13: ["#ban-9"],
    14: ["#ban-10"],
    15: ["#pick-7"],
    16: ["#pick-8", "#pick-9"],
    17: ["#pick-10"],
    18: []
};

let autoAdvanceTimeout = null;

function getPhaseInputs(phaseNum) {
    return phaseInputMap[phaseNum] || [];
}

function arePhaseInputsComplete(phaseNum) {
    const selectors = getPhaseInputs(phaseNum);
    if (selectors.length === 0) return false;
    return selectors.every(sel => {
        const el = document.querySelector(sel);
        return el && el.value.trim() !== "";
    });
}

function cancelAutoAdvance() {
    if (autoAdvanceTimeout) {
        clearTimeout(autoAdvanceTimeout);
        autoAdvanceTimeout = null;
    }
    nextPhaseBtn.classList.remove("auto-advance-ready");
}

function checkPhaseCompletion() {
    cancelAutoAdvance();
    if (draftState.currentPhase < 1 || draftState.currentPhase > 17) return;
    if (!arePhaseInputsComplete(draftState.currentPhase)) return;

    autoAdvanceTimeout = setTimeout(() => {
        nextPhaseBtn.focus();
        nextPhaseBtn.classList.add("auto-advance-ready");
    }, 3000);
}

function focusPhaseInput(phaseNum) {
    const selectors = getPhaseInputs(phaseNum);
    if (selectors.length > 0) {
        const firstEl = document.querySelector(selectors[0]);
        if (firstEl) {
            setTimeout(() => firstEl.focus(), 100);
        }
    }
}

// Attach listeners to all phase-relevant inputs.
// We listen to "input" (for typing), "change", and "blur" (with a short delay
// to catch autocomplete dropdown selections that set value programmatically).
(function setupAutoAdvanceListeners() {
    const seen = new Set();
    for (const selectors of Object.values(phaseInputMap)) {
        for (const sel of selectors) {
            if (seen.has(sel)) continue;
            seen.add(sel);
            const el = document.querySelector(sel);
            if (!el) continue;
            el.addEventListener("input", checkPhaseCompletion);
            el.addEventListener("change", checkPhaseCompletion);
            // Catch autocomplete mousedown selections: the blur fires
            // after the dropdown sets the value programmatically.
            el.addEventListener("blur", () => {
                setTimeout(checkPhaseCompletion, 200);
            });
        }
    }
})();

// ===== EXISTING PHASE CONTROLS =====

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

    // Auto-focus the first input of the current phase
    focusPhaseInput(draftState.currentPhase);
});

// Reset the draft
resetPhaseBtn.addEventListener('click', () => {
    draftState.isRunning = false;
    draftState.currentPhase = 0;
    draftState.timeRemaining = 50;
    localStorage.removeItem(`phase-number`);
    saveState();
    currentPhaseDisplay.textContent = draftState.currentPhase;
    cancelAutoAdvance();
});

const currentPhaseWrapper = document.getElementById("phaseInfo");

// Move to next phase (now auto-starts timer)
nextPhaseBtn.addEventListener('click', () => {
    cancelAutoAdvance();

    if (draftState.currentPhase < 18) {
        draftState.currentPhase++;
        localStorage.setItem(`phase-number`, draftState.currentPhase);
        draftState.isRunning = true; // Auto-start the timer
        draftState.timeRemaining = 50;
        saveState();
        currentPhaseDisplay.textContent = draftState.currentPhase;

        // Auto-focus the first input of the new phase
        focusPhaseInput(draftState.currentPhase);
    } else {
        alert("Draft completed!");
    }

    if (draftState.currentPhase === 18) {
        alert("Draft completed! Finaize Comps");
    }
});

// Initialize
loadState();

// If resuming into an active phase, focus its input
if (draftState.currentPhase >= 1 && draftState.currentPhase <= 17) {
    focusPhaseInput(draftState.currentPhase);
}
