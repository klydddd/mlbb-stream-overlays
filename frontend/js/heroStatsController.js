// Controller side of the draft hero stats (TOURNAMENT STATS panel in controller.html).
// - +1 on a team score logs the finished game (all 10 picks + bans) to the active tournament.
//   Incomplete drafts are not logged; the score still changes and a warning toast shows.
// - −1 deletes the latest logged game, but only if that team won it and its score really dropped.
// - SWITCH TEAMS also changes scores but has no data-score-delta, so it never logs.
// After any change it sends { type: "tournament-stats-changed" } so displays refetch.
import { send } from "./websocketClient.js";
import { buildGameRecord, shouldUndo } from "./heroStatsCore.js";
import * as api from "./heroStatsApi.js";

const channel = new BroadcastChannel("team_channel");
const select = document.getElementById("stats-tournament");
const nameInput = document.getElementById("stats-new-name");
const createBtn = document.getElementById("stats-create");
const statusEl = document.getElementById("stats-status");

let activeId = null;

function notifyDisplays() {
  const msg = { type: "tournament-stats-changed" };
  channel.postMessage(msg);
  send(msg);
}

let toastTimer = null;
function toast(text, kind = "warn") {
  let el = document.getElementById("stats-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "stats-toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.className = `stats-toast ${kind} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), kind === "warn" ? 6000 : 2500);
}

async function renderStatus() {
  if (!statusEl) return;
  if (!activeId) { statusEl.textContent = "NO ACTIVE TOURNAMENT · GAMES WON'T BE RECORDED"; return; }
  try {
    const n = await api.countGames(activeId);
    statusEl.textContent = `${n} GAME${n === 1 ? "" : "S"} LOGGED`;
  } catch {
    statusEl.textContent = "OFFLINE · CAN'T REACH STATS DATABASE";
  }
}

async function refresh() {
  try {
    const [list, id] = await Promise.all([api.listTournaments(), api.getActiveTournamentId()]);
    activeId = id;
    if (select) {
      select.innerHTML = "";
      const none = new Option("— NO TOURNAMENT —", "");
      select.add(none);
      list.forEach((t) => select.add(new Option(t.name, t.id)));
      select.value = activeId || "";
    }
  } catch (e) {
    console.error("[heroStats]", e);
  }
  renderStatus();
}

select?.addEventListener("change", async () => {
  const id = select.value || null;
  try {
    await api.setActiveTournament(id);
    activeId = id;
    notifyDisplays();
  } catch (e) {
    console.error("[heroStats]", e);
    toast("COULDN'T CHANGE TOURNAMENT (OFFLINE?)");
    select.value = activeId || "";
  }
  renderStatus();
});

createBtn?.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  createBtn.disabled = true;
  try {
    const t = await api.createTournament(name);
    await api.setActiveTournament(t.id);
    nameInput.value = "";
    await refresh();
    notifyDisplays();
    toast(`TOURNAMENT "${t.name}" CREATED AND ACTIVE`, "ok");
  } catch (e) {
    console.error("[heroStats]", e);
    toast("COULDN'T CREATE TOURNAMENT (OFFLINE?)");
  } finally {
    createBtn.disabled = false;
  }
});

const score = (team) => Math.max(0, parseInt(localStorage.getItem(`${team}-score`), 10) || 0);

async function onWin(team) {
  if (!activeId) { toast("GAME NOT RECORDED · NO ACTIVE TOURNAMENT"); return; }
  const built = buildGameRecord((k) => localStorage.getItem(k), team);
  if (!built.ok) { toast("GAME NOT RECORDED · DRAFT INCOMPLETE (NEED ALL 10 PICKS)"); return; }
  try {
    await api.logGame(activeId, built.record);
    notifyDisplays();
    toast(`GAME LOGGED · ${team.toUpperCase()} WIN`, "ok");
  } catch (e) {
    console.error("[heroStats]", e);
    toast("GAME NOT SAVED · CAN'T REACH STATS DATABASE");
  }
  renderStatus();
}

async function onDeduct(team, prev, now) {
  if (!activeId || now >= prev) return;
  try {
    const latest = await api.latestGame(activeId);
    if (!shouldUndo(latest, team, prev, now)) return;
    await api.deleteGame(latest.id);
    notifyDisplays();
    toast(`LAST LOGGED GAME REMOVED (${team.toUpperCase()} WIN)`, "ok");
  } catch (e) {
    console.error("[heroStats]", e);
    toast("COULDN'T UNDO LOGGED GAME (OFFLINE?)");
  }
  renderStatus();
}

// Capture phase: read the score before js/ingame.js changes it, then compare right after.
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-score-team][data-score-delta]");
  if (!btn) return;
  const team = btn.dataset.scoreTeam;
  const delta = parseInt(btn.dataset.scoreDelta, 10);
  const prev = score(team);
  setTimeout(() => {
    const now = score(team);
    if (delta > 0 && now > prev) onWin(team);
    else if (delta < 0) onDeduct(team, prev, now);
  }, 0);
}, true);

// Another machine may have switched tournaments
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

refresh();
