import { send } from "./websocketClient.js";

const channel = new BroadcastChannel("team_channel");

const clearNameBtn = document.querySelector("#clear-names");
const clearCamLinkBtn = document.querySelector("#clear-cam-links");
const clearPicksBtn = document.querySelector("#clear-picks");
const clearBansBtn = document.querySelector("#clear-bans");
const clearScoresBtn = document.querySelector("#clear-scores");

function clearInputs(prefix, storageKeyPrefix) {
  for (let i = 1; i <= 10; i++) {
    localStorage.removeItem(`${storageKeyPrefix}-${i}`);
    const input = document.querySelector(`#${prefix}-${i}`);
    if (input) input.value = "";
  }
}

// CLEAR NAMES
if (clearNameBtn) {
  clearNameBtn.addEventListener("click", () => {
    clearInputs("input-name", "player-name");
    channel.postMessage({ type: "clear-names" });
    send({ type: "clear-names" });
  });
}

// CLEAR CAM LINKS (individual + team cam links)
if (clearCamLinkBtn) {
  clearCamLinkBtn.addEventListener("click", () => {
    // Clear individual cam inputs (cam-1 to cam-10)
    clearInputs("cam", "camera-link");

    // Clear team cam link inputs
    for (let i = 1; i <= 2; i++) {
      localStorage.removeItem(`team-cam-link-${i}`);
      const input = document.querySelector(`#team-cam-link-${i}`);
      if (input) input.value = "";
    }

    channel.postMessage({ type: "clear-cam-links" });
    send({ type: "clear-cam-links" });
  });
}

// CLEAR PICKS
if (clearPicksBtn) {
  clearPicksBtn.addEventListener("click", () => {
    clearInputs("pick", "heroPick");
    channel.postMessage({ type: "clear-picks" });
    send({ type: "clear-picks" });
  });
}

// CLEAR BANS
if (clearBansBtn) {
  clearBansBtn.addEventListener("click", () => {
    clearInputs("ban", "banPick");
    channel.postMessage({ type: "clear-bans" });
    send({ type: "clear-bans" });
  });
}

// CLEAR SCORES
if (clearScoresBtn) {
  clearScoresBtn.addEventListener("click", () => {
    localStorage.removeItem("blue-score");
    localStorage.removeItem("red-score");
    channel.postMessage({ type: "clear-scores" });
    send({ type: "clear-scores" });
  });
}
