// displayTimer.js — the draft timer on display.html (number + progress bar), driven by
// the controller's timer.js through localStorage (draftState, then draftUpdate).
//
// No per-frame JS (AUDIT_OPTIMIZATION.md #6): the progress bar runs as one Web Animation
// on transform, which the browser composites on the GPU, and the number is updated by a
// timeout lined up to each whole second. Updates arrive as storage events instead of
// polling localStorage.
const timerDisplay = document.getElementById('timerDisplay');
const progressFill = document.getElementById('progressFill');

const REFILL_S = 0.5; // the bar refills to full over this long when a phase starts

let isRunning = false;
let lastPhase = 0;
let barAnimation = null;
let tickTimeout = null;
let endTime = 0;
let shown = null;

function showNumber(value) {
    if (value === shown) return;
    shown = value;
    timerDisplay.textContent = String(value);
    progressFill.classList.toggle('warning', value <= 10);
}

function tick() {
    const remaining = Math.max(0, (endTime - performance.now()) / 1000);
    const value = Math.ceil(remaining);
    showNumber(value);
    if (remaining <= 0 || !isRunning) {
        isRunning = false;
        return;
    }
    // wake up just after the number next drops
    tickTimeout = setTimeout(tick, (remaining - (value - 1)) * 1000 + 5);
}

function startBar(duration) {
    // start from wherever the bar is now (mid-refill, paused, or empty)
    const from = getComputedStyle(progressFill).transform;
    if (barAnimation) barAnimation.cancel();
    progressFill.style.transition = 'none';
    progressFill.style.transform = 'scaleX(0)'; // the end state, kept after the animation

    const keyframes = [{ transform: from === 'none' ? 'scaleX(1)' : from, easing: 'ease-out' }];
    if (duration > REFILL_S) {
        keyframes.push({
            transform: `scaleX(${(duration - REFILL_S) / duration})`,
            offset: REFILL_S / duration,
            easing: 'linear',
        });
    }
    keyframes.push({ transform: 'scaleX(0)' });
    barAnimation = progressFill.animate(keyframes, { duration: duration * 1000, fill: 'forwards' });
}

function startTimerWithTransition(duration) {
    clearTimeout(tickTimeout);
    shown = null;
    isRunning = true;
    endTime = performance.now() + duration * 1000;
    startBar(duration);
    tick();
}

function stopTimer() {
    clearTimeout(tickTimeout);
    isRunning = false;
    if (barAnimation) barAnimation.pause(); // the bar freezes where it is
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

// timer.js writes draftState, then draftUpdate; storage events arrive in that order.
// key === null means localStorage was cleared (RESET DRAFT).
window.addEventListener('storage', (e) => {
    if (e.key === 'draftUpdate' || e.key === null) updateDisplay();
});

updateDisplay();
