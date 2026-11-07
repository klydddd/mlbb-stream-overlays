// Controller layout helpers (UI only — nothing here is synced to the display).
// - Click a panel header to fold/unfold it. Blue and red copies of a panel fold together.
// - SETUP / LIVE / INGAME toggle: LIVE hides every panel with data-group="setup";
//   INGAME shows only the data-group="ingame" panels (js/ingame.js), WAITING only the
//   data-group="waiting" panels (js/waitingController.js); the other modes hide both.
// - Folded panels show a "filled / total" chip so you can see they're done.
// - Per-player photo sliders (injected by playerPhotos.js) go behind a "fine-tune" disclosure.
// State is kept in localStorage under "controller-ui".
(function () {
  const STORAGE_KEY = "controller-ui";
  const MODES = ["setup", "live", "ingame", "waiting"];
  const SOLO_MODES = ["ingame", "waiting"]; // modes that show only their own group
  const NOTES = { live: "LIVE MODE: SETUP SECTIONS HIDDEN", ingame: "INGAME MODE: DRAFT SECTIONS HIDDEN", waiting: "WAITING MODE: CONTROLS FOR WAITING.HTML" };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") {
        return { mode: MODES.includes(saved.mode) ? saved.mode : "setup", folded: new Set(saved.folded || []) };
      }
    } catch (e) { /* ignore */ }
    return { mode: "setup", folded: new Set() };
  }

  const state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: state.mode, folded: [...state.folded] }));
    } catch (e) { /* ignore */ }
  }

  function panels() {
    return [...document.querySelectorAll(".panel[data-panel]")];
  }

  // "filled / total" for a panel: text inputs, or uploaded photos for the photo panel
  function countFilled(panel) {
    const photos = panel.querySelectorAll(".photo-upload");
    if (photos.length) {
      return [panel.querySelectorAll(".photo-upload.has-photo").length, photos.length];
    }
    const fields = [...panel.querySelectorAll('.panel-body input[type="text"], .panel-body input[type="url"], .panel-body textarea')]
      .filter((f) => !f.closest("[hidden]"));
    if (!fields.length) return null;
    return [fields.filter((f) => f.value.trim() !== "").length, fields.length];
  }

  function updateChips() {
    panels().forEach((panel) => {
      const chip = panel.querySelector(".panel-chip");
      if (!chip) return;
      const c = countFilled(panel);
      if (!c) { chip.textContent = ""; chip.hidden = true; return; }
      chip.hidden = false;
      chip.textContent = `${c[0]}/${c[1]}`;
      chip.classList.toggle("full", c[0] === c[1]);
    });
  }

  function updateSideTitles() {
    document.querySelectorAll(".side-team[data-team-input]").forEach((el) => {
      const input = document.getElementById(el.dataset.teamInput);
      el.textContent = input ? input.value.trim() : "";
    });
  }

  function render() {
    const live = state.mode === "live";
    const solo = SOLO_MODES.includes(state.mode);
    document.body.classList.toggle("ui-live", live);
    document.body.classList.toggle("ui-ingame", state.mode === "ingame");
    document.body.classList.toggle("ui-waiting", state.mode === "waiting");

    document.querySelectorAll("[data-ui-mode]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.uiMode === state.mode));
    });

    const note = document.getElementById("ui-note");
    if (note) note.textContent = NOTES[state.mode] || "";

    panels().forEach((panel) => {
      const group = panel.dataset.group;
      panel.hidden = solo ? group !== state.mode : SOLO_MODES.includes(group) || (live && group === "setup");
      const folded = state.folded.has(panel.dataset.panel);
      panel.classList.toggle("folded", folded);
      const head = panel.querySelector(".panel-head");
      if (head) head.setAttribute("aria-expanded", String(!folded));
    });

    updateChips();
    updateSideTitles();
    saveState();
  }

  // Put playerPhotos.js's per-player slider rows behind a disclosure
  function wrapFineTune() {
    document.querySelectorAll(".panel .photo-zooms").forEach((row) => {
      if (row.closest(".photo-fine-tune")) return;
      const details = document.createElement("details");
      details.className = "photo-fine-tune";
      const summary = document.createElement("summary");
      summary.textContent = "FINE-TUNE EACH PLAYER (ZOOM / POSITION)";
      row.before(details);
      details.append(summary, row);
    });
  }

  function init() {
    wrapFineTune();

    document.addEventListener("click", (e) => {
      const head = e.target.closest(".panel-head");
      if (head) {
        const id = head.closest(".panel").dataset.panel;
        if (state.folded.has(id)) state.folded.delete(id);
        else state.folded.add(id);
        render();
        return;
      }
      const modeBtn = e.target.closest("[data-ui-mode]");
      if (modeBtn) {
        if (MODES.includes(modeBtn.dataset.uiMode)) state.mode = modeBtn.dataset.uiMode;
        render();
      }
    });

    const collapseAll = document.getElementById("panels-collapse-all");
    const expandAll = document.getElementById("panels-expand-all");
    if (collapseAll) collapseAll.addEventListener("click", () => {
      panels().forEach((p) => { if (!p.hidden) state.folded.add(p.dataset.panel); });
      render();
    });
    if (expandAll) expandAll.addEventListener("click", () => {
      state.folded.clear();
      render();
    });

    // Typing updates chips/titles right away; programmatic changes (restore, clear,
    // switch teams, photo uploads) are picked up by the slow refresh below.
    document.addEventListener("input", () => { updateChips(); updateSideTitles(); });
    setInterval(() => { updateChips(); updateSideTitles(); }, 1000);

    render();
  }

  // Module scripts (playerPhotos.js etc.) have run by DOMContentLoaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
