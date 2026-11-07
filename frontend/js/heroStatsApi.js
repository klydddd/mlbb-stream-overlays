// Supabase REST calls for the draft hero stats (tables: tournaments, games, settings).
// The key is the project's publishable key: safe to ship in the page. Row Level Security limits
// it to reading everything, adding tournaments, logging/deleting games and setting the active tournament.
export const SUPABASE_URL = "https://yuizoxltxussbzmcipvi.supabase.co";
const SUPABASE_KEY = "sb_publishable_RD8jt8IbUoIeK5OEyKeOgw_Ur4ceIYe";
const TIMEOUT_MS = 8000;

async function rest(path, { method = "GET", body, prefer } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${method} ${path}: ${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

export async function listTournaments() {
  return rest("tournaments?select=id,name,created_at&order=created_at.desc");
}

export async function createTournament(name) {
  const rows = await rest("tournaments", { method: "POST", body: { name }, prefer: "return=representation" });
  return rows[0];
}

export async function getActiveTournamentId() {
  const rows = await rest("settings?select=active_tournament_id&id=eq.1");
  return rows[0]?.active_tournament_id || null;
}

export async function setActiveTournament(id) {
  await rest("settings?id=eq.1", { method: "PATCH", body: { active_tournament_id: id, updated_at: new Date().toISOString() } });
}

export async function listGames(tournamentId) {
  return rest(`games?select=id,winner,blue_picks,red_picks,bans,created_at&tournament_id=eq.${encodeURIComponent(tournamentId)}`);
}

export async function countGames(tournamentId) {
  return (await listGames(tournamentId)).length;
}

export async function latestGame(tournamentId) {
  const rows = await rest(`games?select=id,winner&tournament_id=eq.${encodeURIComponent(tournamentId)}&order=created_at.desc,id.desc&limit=1`);
  return rows[0] || null;
}

export async function logGame(tournamentId, record) {
  await rest("games", { method: "POST", body: { ...record, tournament_id: tournamentId } });
}

export async function deleteGame(id) {
  await rest(`games?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
}
