// Series length as "race to N" wins (1, 2 or 3): how many score boxes each team gets on
// display.html and gameDisplay.html. Set by the controller (js/seriesRaceController.js).
//   localStorage "series-race"   "1" | "2" | "3"  (missing = 3)
//   message { type: "series-race", value }        (BroadcastChannel + WebSocket)
import { onMessage } from "./websocketClient.js";

export const RACE_OPTIONS = [1, 2, 3];
export const DEFAULT_RACE = 3;

export function parseRace(value) {
  const n = parseInt(value, 10);
  return RACE_OPTIONS.includes(n) ? n : DEFAULT_RACE;
}

// Calls onChange(race) now and whenever the controller changes it.
export function watchSeriesRace(onChange) {
  let current = parseRace(localStorage.getItem("series-race"));
  const apply = (value) => {
    const race = parseRace(value);
    if (race === current) return;
    current = race;
    onChange(race);
  };
  onChange(current);

  const handle = (data) => {
    if (data?.type === "series-race") apply(data.value);
  };
  new BroadcastChannel("team_channel").addEventListener("message", (e) => handle(e.data));
  onMessage(handle);
  window.addEventListener("storage", (e) => {
    // RESET DRAFT clears localStorage; the controller writes series-race back right after
    if (e.key === "series-race") apply(e.newValue);
  });
}
