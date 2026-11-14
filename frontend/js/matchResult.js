// Who has won a schedule match (waiting.html and cams.html; rows from js/waitingController.js).
// A team wins once it reaches the wins its format needs: BO1 -> 1, BO3 -> 2, BO5 -> 3
// (best of N: more than half). The format is free text ("BO3", "bo 5", "Best of 5");
// anything without a number counts as BO3, the controller's default.
export const DEFAULT_BEST_OF = 3;

export function bestOf(format) {
  const m = String(format || "").match(/(?:bo|best\s*of)\s*(\d+)/i);
  const n = m ? parseInt(m[1], 10) : NaN;
  return n > 0 ? n : DEFAULT_BEST_OF;
}

export const winsNeeded = (format) => Math.floor(bestOf(format) / 2) + 1;

const score = (t) => Math.max(0, parseInt(t?.score, 10) || 0);

// "a" | "b" once one side has the wins it needs (and more than the other), else null
export function matchWinner(m) {
  const need = winsNeeded(m?.format);
  const a = score(m?.a), b = score(m?.b);
  if (a >= need && a > b) return "a";
  if (b >= need && b > a) return "b";
  return null;
}

// true for the side that lost a decided match
export function matchLost(m, side) {
  const w = matchWinner(m);
  return w !== null && w !== side;
}
