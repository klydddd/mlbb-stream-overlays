const clearNameBtn = document.querySelector("#clear-names");
const clearCamLinkBtn = document.querySelector("#clear-cam-links");
const clearPicksBtn = document.querySelector("#clear-picks");
const clearBansBtn = document.querySelector("#clear-bans");

function broadcastType(tp) {
    channel.postMessage({ type: tp });
}

function clearInputs(prefix, storageKeyPrefix) {
  for (let i = 1; i <= 10; i++) {
    localStorage.removeItem(`${storageKeyPrefix}-${i}`);
    const input = document.querySelector(`#${prefix}-${i}`);
    if (input) input.value = "";
  }
}

if (clearNameBtn && clearCamLinkBtn && clearPicksBtn) {
  clearNameBtn.addEventListener("click", () => {
    clearInputs("input-name", "player-name");
    channel.postMessage({ type: "clear-names" });
  });

  clearCamLinkBtn.addEventListener("click", () => {
    clearInputs("cam", "camera-link");
  });
  clearPicksBtn.addEventListener("click", () => {
    clearInputs("pick", "heroPick");
    channel.postMessage({ type: "clear-picks" });
  });
  clearBansBtn.addEventListener("click", () => {
    clearInputs("ban", "banPick");
    channel.postMessage({ type: "clear-bans" });
  });
}

// add clear team names
// add clear scores
// add clear logos
