function checkPhase(number) {

  if (number % 2 === 0){
    return 0;
  } else {
    return 1;
  }


}

const bluePickIdentifier = document.querySelector("#triangle-left");
const redPickIdentifier = document.querySelector("#triangle-right");
const progressBar = document.querySelector("#progressFill");

window.addEventListener('storage', (e) => {
  const isPhase = e.key && e.key.startsWith('phase-number');
  const phaseNumber = localStorage.getItem('phase-number');

  // ✅ Always respond to ban picks
  if (isPhase) {
    console.log(phaseNumber);
    
    // Default both visible
    let blueOpacity = 1;
    let redOpacity = 1;
    
    if (phaseNumber === null) {
        // Keep defaults (both visible)
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
    }
    // For phaseNumber >= 14, keep defaults (both visible)
    
    bluePickIdentifier.style.opacity = blueOpacity;
    redPickIdentifier.style.opacity = redOpacity;
    
    return;
}

});
