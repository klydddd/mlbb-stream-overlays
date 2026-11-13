// overlayChain.js — page switching for the draft browser source.
//
// One OBS browser source moves between the overlay pages when the controller says so
// (DRAFT CONTROL buttons in js/control.js, plus the timer):
//   show-draft-display  -> display.html          (SHOW DRAFT, timer RESET)
//   show-heroes-display -> heroes-display.html   (SHOW HEROES, last phase countdown)
//   show-ingame-display -> gameDisplay.html      (SHOW INGAME)
//   show-cams-display   -> cams.html             (SHOW CAMS)
//
// gameDisplay.html and cams.html can also be standalone OBS sources, which must stay
// put. goTo() marks this tab (sessionStorage "overlay-chain") as the draft source, and
// those two pages only follow the switch messages when inDraftChain() is true.

export const PAGE_FOR = {
  "show-draft-display": "display.html",
  "show-heroes-display": "heroes-display.html",
  "show-ingame-display": "gameDisplay.html",
  "show-cams-display": "cams.html",
};

// Load another overlay page in this tab, same room (query string kept).
export function goTo(page) {
  try { sessionStorage.setItem("overlay-chain", "1"); } catch { /* ignore */ }
  window.location.href = page + window.location.search;
}

export function inDraftChain() {
  try { return sessionStorage.getItem("overlay-chain") === "1"; } catch { return false; }
}

// For gameDisplay.html / cams.html: follow a switch message to another page, but only
// when this tab is the draft source and the target isn't this page. True if handled.
// beforeLeave(done), if given, runs first (an exit animation) and calls done() to go.
export function followSwitch(type, currentPage, beforeLeave) {
  const page = PAGE_FOR[type];
  if (!page) return false;
  if (page !== currentPage && inDraftChain()) {
    if (beforeLeave) beforeLeave(() => goTo(page));
    else goTo(page);
  }
  return true;
}
