// Series length as "race to N" wins (1, 2 or 3): how many score boxes each team gets on
// display.html, gameDisplay.html and heroes-display.html. Set by the controller (js/seriesRaceController.js).
//   localStorage "series-race"   "1" | "2" | "3"  (missing = 3)
//   message { type: "series-race", value }        (BroadcastChannel + WebSocket)
//   On connect a display sends { type: "series-race-request" }; the controller answers
//   with "series-race". A received value is saved, so OBS (its own localStorage) keeps it
//   across reloads.
import { onMessage, send } from "./websocketClient.js";

export const RACE_OPTIONS = [1, 2, 3];
export const DEFAULT_RACE = 3;

export function parseRace(value) {
  const n = parseInt(value, 10);
  return RACE_OPTIONS.includes(n) ? n : DEFAULT_RACE;
}

// Calls onChange(race) now and whenever the controller changes it.
export function watchSeriesRace(onChange) {
  let current = parseRace(localStorage.getItem("series-race"));
  const apply = (value, save = false) => {
    const race = parseRace(value);
    if (save) {
      try { localStorage.setItem("series-race", String(race)); } catch { /* storage blocked */ }
    }
    if (race === current) return;
    current = race;
    onChange(race);
  };
  onChange(current);

  const handle = (data) => {
    if (data?.type === "series-race") apply(data.value, true);
  };
  new BroadcastChannel("team_channel").addEventListener("message", (e) => handle(e.data));
  onMessage(handle);
  window.addEventListener("storage", (e) => {
    // RESET DRAFT clears localStorage; the controller writes series-race back right after
    if (e.key === "series-race") apply(e.newValue);
  });

  // Ask the controller for the current value once the socket is up. send() returns false
  // until it is open; give up after ~10 s (no relay = same browser, localStorage covers it).
  let asks = 0;
  const ask = setInterval(() => {
    if (send({ type: "series-race-request" }) || ++asks > 20) clearInterval(ask);
  }, 500);
}
