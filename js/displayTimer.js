// DOM elements
const timerDisplay = document.getElementById('timerDisplay');
const phaseDisplay = document.getElementById('phaseDisplay');
const phaseText = document.getElementById('phaseText');
const progressFill = document.getElementById('progressFill');

// Timer variables
let animationFrame;
let lastUpdateTime = 0;
let maxTime = 50;
let startTimestamp;
let remainingTime;
let isRunning = false;
let lastPhase = 0;

// Format time as SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${secs.toString().padStart(1, '0')}`;
}

// Smooth animation using requestAnimationFrame
function animateProgress(timestamp) {
    if (!startTimestamp) startTimestamp = timestamp;
    const elapsed = (timestamp - startTimestamp) / 1000;
    const currentRemaining = Math.max(0, remainingTime - elapsed);
    
    // Update display
    timerDisplay.textContent = formatTime(Math.ceil(currentRemaining));
    
    // Calculate progress (0 to 1)
    const progress = currentRemaining / maxTime;
    const scaleX = Math.max(0, progress);
    
    // Apply scaling transformation for smooth shrinking
    progressFill.style.transform = `scaleX(${scaleX})`;
    
    // Update warning state
    progressFill.classList.toggle('warning', currentRemaining <= 10);
    
    // Continue animation if time remains and timer is running
    if (currentRemaining > 0 && isRunning) {
        animationFrame = requestAnimationFrame(animateProgress);
    } else {
        // Timer complete
        timerComplete();
    }
}

// Timer complete handler
function timerComplete() {
    cancelAnimationFrame(animationFrame);
    isRunning = false;
}

// Start the countdown timer with smooth transition
function startTimerWithTransition(duration) {
    cancelAnimationFrame(animationFrame);
    
    // Reset display immediately
    maxTime = duration;
    remainingTime = duration;
    timerDisplay.textContent = formatTime(duration);
    
    // Animate the progress bar refill
    progressFill.style.transition = 'transform 0.5s ease-out';
    progressFill.style.transform = 'scaleX(1)';
    
    // Start countdown after refill animation completes
    setTimeout(() => {
        progressFill.style.transition = 'transform 0.5s ease-out'; // Remove transition for smooth countdown
        isRunning = true;
        startTimestamp = null;
        animationFrame = requestAnimationFrame(animateProgress);
    }, 0); // Match this with the CSS transition duration
}

// Stop the timer
function stopTimer() {
    cancelAnimationFrame(animationFrame);
    isRunning = false;
}

// Update display from localStorage
function updateDisplay() {
    const draftState = JSON.parse(localStorage.getItem('draftState') || '{"isRunning":false,"currentPhase":0,"timeRemaining":50}');
    
    // Handle phase changes or manual resets
    if (draftState.currentPhase !== lastPhase || draftState.phaseChanged) {
        lastPhase = draftState.currentPhase;
        if (draftState.isRunning) {
            startTimerWithTransition(draftState.timeRemaining);
        } else {

            stopTimer();
        }
    }
    
    // Handle timer state changes
    if (draftState.isRunning && !isRunning) {
        startTimerWithTransition(draftState.timeRemaining);
    } else if (!draftState.isRunning && isRunning) {
        stopTimer();
    }
}

// Check for updates from controller
function checkForUpdates() {
    const lastUpdate = localStorage.getItem('draftUpdate') || '0';
    if (lastUpdate !== lastUpdateTime) {
        lastUpdateTime = lastUpdate;
        updateDisplay();
    }
}

// Initialize
updateDisplay();
setInterval(checkForUpdates, 100); // Check for updates 10 times per second
