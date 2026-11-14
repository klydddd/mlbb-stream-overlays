// RACE TO 1 / 2 / 3 toggle on the controller (MATCH INFO in SETUP, SCORE in INGAME).
// Every [data-series-race] button sets it; all copies stay in step.
// Display side and storage format: js/seriesRace.js.
import { send, onMessage } from "./websocketClient.js";
import { parseRace } from "./seriesRace.js?v=2";

const channel = new BroadcastChannel("team_channel");
let race = parseRace(localStorage.getItem("series-race"));

function render() {
  document.querySelectorAll("[data-series-race]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(parseRace(btn.dataset.seriesRace) === race));
  });
}

function setRace(value) {
  race = parseRace(value);
  localStorage.setItem("series-race", String(race));
  const msg = { type: "series-race", value: race };
  channel.postMessage(msg);
  send(msg);
  render();
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-series-race]");
  if (btn) setRace(btn.dataset.seriesRace);
});

// RESET DRAFT clears all of localStorage (control.js runs first); the series length
// is match setup, not draft data, so keep it.
document.getElementById("reset")?.addEventListener("click", () => setRace(race));

// another controller tab in the same browser
window.addEventListener("storage", (e) => {
  if (e.key === "series-race" && e.newValue !== null) {
    race = parseRace(e.newValue);
    render();
  }
});

// a display that just loaded (OBS reload, another PC) asks for the current value
onMessage((data) => {
  if (data?.type === "series-race-request") send({ type: "series-race", value: race });
});

render();
