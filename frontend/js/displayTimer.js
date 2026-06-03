const timerDisplay = document.getElementById('timerDisplay');
const progressFill = document.getElementById('progressFill');

let animationFrame;
let lastUpdateTime = 0;
let maxTime = 50;
let startTimestamp;
let remainingTime;
let isRunning = false;
let lastPhase = 0;

function formatTime(seconds) {
    return `${seconds.toString().padStart(1, '0')}`;
}

function animateProgress(timestamp) {
    if (!startTimestamp) startTimestamp = timestamp;
    const elapsed = (timestamp - startTimestamp) / 1000;
    const currentRemaining = Math.max(0, remainingTime - elapsed);

    timerDisplay.textContent = formatTime(Math.ceil(currentRemaining));

    const progress = currentRemaining / maxTime;
    const scaleX = Math.max(0, progress);

    progressFill.style.transform = `scaleX(${scaleX})`;
    progressFill.classList.toggle('warning', currentRemaining <= 10);

    if (currentRemaining > 0 && isRunning) {
        animationFrame = requestAnimationFrame(animateProgress);
    } else {
        timerComplete();
    }
}

function timerComplete() {
    cancelAnimationFrame(animationFrame);
    isRunning = false;
}

function startTimerWithTransition(duration) {
    cancelAnimationFrame(animationFrame);

    maxTime = duration;
    remainingTime = duration;
    timerDisplay.textContent = formatTime(duration);

    progressFill.style.transition = 'transform 0.5s ease-out';
    progressFill.style.transform = 'scaleX(1)';

    setTimeout(() => {
        progressFill.style.transition = 'transform 0.5s ease-out';
        isRunning = true;
        startTimestamp = null;
        animationFrame = requestAnimationFrame(animateProgress);
    }, 0);
}

function stopTimer() {
    cancelAnimationFrame(animationFrame);
    isRunning = false;
}

function updateDisplay() {
    const draftState = JSON.parse(localStorage.getItem('draftState') || '{"isRunning":false,"currentPhase":0,"timeRemaining":50}');

    if (draftState.currentPhase !== lastPhase || draftState.phaseChanged) {
        lastPhase = draftState.currentPhase;
        if (draftState.isRunning) {
            startTimerWithTransition(draftState.timeRemaining);
        } else {
            stopTimer();
        }
    }

    if (draftState.isRunning && !isRunning) {
        startTimerWithTransition(draftState.timeRemaining);
    } else if (!draftState.isRunning && isRunning) {
        stopTimer();
    }
}

function checkForUpdates() {
    const lastUpdate = localStorage.getItem('draftUpdate') || '0';
    if (lastUpdate !== lastUpdateTime) {
        lastUpdateTime = lastUpdate;
        updateDisplay();
    }
}

updateDisplay();
setInterval(checkForUpdates, 100);
