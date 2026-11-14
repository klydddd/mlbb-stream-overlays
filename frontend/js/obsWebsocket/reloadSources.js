// OBS WebSocket from the controller:
// - RELOAD OBS (toolbar): refreshes every browser source in OBS, the same as pressing
//   "Refresh cache of current page" in each source's properties.
// - Background source: SHOW INGAME hides the "MAIN BG" source (name set in OBS SETTINGS),
//   SHOW DRAFT / HEROES / CAMS show it again. Follows the "draft-display-switch" event
//   (js/control.js), so the timer's automatic switches count too. Every scene and group
//   holding a source with that name (case ignored) is changed.
//
// Talks to the OBS WebSocket server (OBS 28+: Tools > WebSocket Server Settings) through
// js/obsWebsocket/obsClient.js: GetInputList -> PressInputPropertiesButton "refreshnocache"
// for each browser source.
//
// The address and password are typed in the OBS settings row under the toolbar and kept in
// this browser's localStorage ("obs-ws-url", "obs-ws-password"). They are put back after
// RESET DRAFT, which clears localStorage. Nothing here is sent to the overlays.

import { DEFAULT_URL, URL_KEY, PASSWORD_KEY, read, write, connect, errorText } from "./obsClient.js";

const BG_KEY = "obs-bg-source";
const DEFAULT_BG = "MAIN BG";

const $ = (id) => document.getElementById(id);
const button = $("obs-reload");
const status = $("obs-status");
const settings = $("obs-settings");
const urlInput = $("obs-url");
const passwordInput = $("obs-password");
const bgInput = $("obs-bg");

function setStatus(text, kind = "") {
  status.textContent = text;
  status.dataset.kind = kind; // "", "ok", "error"
}

let busy = false;

async function reloadAll() {
  if (busy) return;
  busy = true;
  button.disabled = true;
  setStatus("CONNECTING TO OBS…");
  let obs;
  try {
    obs = await connect(read(URL_KEY) || DEFAULT_URL, read(PASSWORD_KEY));
    const { inputs = [] } = await obs.request("GetInputList");
    const browsers = inputs.filter((i) => (i.unversionedInputKind || i.inputKind) === "browser_source");
    if (!browsers.length) {
      setStatus("NO BROWSER SOURCES IN OBS", "error");
      return;
    }
    const results = await Promise.allSettled(browsers.map((i) =>
      obs.request("PressInputPropertiesButton", { inputName: i.inputName, propertyName: "refreshnocache" })));
    const failed = browsers.filter((_, n) => results[n].status === "rejected").map((i) => i.inputName);
    const done = browsers.length - failed.length;
    if (failed.length) setStatus(`RELOADED ${done}/${browsers.length}. FAILED: ${failed.join(", ")}`, "error");
    else setStatus(`RELOADED ${done} BROWSER SOURCE${done === 1 ? "" : "S"}`, "ok");
  } catch (err) {
    setStatus(errorText(err), "error");
    if (err.hint === "settings") settings.hidden = false;
  } finally {
    obs?.close();
    busy = false;
    button.disabled = false;
  }
}

// ---------- Background source: hidden for the in-game HUD, shown for the other pages ----------


async function setBackground(visible) {
  const name = (read(BG_KEY) || DEFAULT_BG).trim();
  const want = name.toLowerCase();
  let obs;
  try {
    obs = await connect(read(URL_KEY) || DEFAULT_URL, read(PASSWORD_KEY));
    const { scenes = [] } = await obs.request("GetSceneList");
    const { groups = [] } = await obs.request("GetGroupList").catch(() => ({}));
    // [sceneName, request that lists its items] for every scene and group
    const holders = [
      ...scenes.map((s) => [s.sceneName, "GetSceneItemList"]),
      ...groups.map((g) => [g, "GetGroupSceneItemList"]),
    ];
    let changed = 0;
    for (const [sceneName, listRequest] of holders) {
      const { sceneItems = [] } = await obs.request(listRequest, { sceneName }).catch(() => ({}));
      for (const item of sceneItems) {
        if ((item.sourceName || "").trim().toLowerCase() !== want) continue;
        await obs.request("SetSceneItemEnabled", { sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: visible });
        changed++;
      }
    }
    if (changed) setStatus(`${name.toUpperCase()} ${visible ? "SHOWN" : "HIDDEN"}`, "ok");
    else setStatus(`NO "${name.toUpperCase()}" SOURCE IN OBS · CHECK OBS SETTINGS`, "error");
  } catch (err) {
    setStatus(errorText(err), "error");
  } finally {
    obs?.close();
  }
}

// one change at a time, in click order (quick clicks never leave it in the wrong state)
let bgQueue = Promise.resolve();
window.addEventListener("draft-display-switch", (e) => {
  const visible = e.detail?.target !== "ingame";
  bgQueue = bgQueue.then(() => setBackground(visible));
});

// ---------- settings row ----------

function fillSettings() {
  urlInput.value = read(URL_KEY) || DEFAULT_URL;
  passwordInput.value = read(PASSWORD_KEY);
  bgInput.value = read(BG_KEY) || DEFAULT_BG;
}

$("obs-settings-toggle").addEventListener("click", () => {
  settings.hidden = !settings.hidden;
  if (!settings.hidden) fillSettings();
});

// kept in memory too, for RESET DRAFT below
const saved = { url: read(URL_KEY), password: read(PASSWORD_KEY), bg: read(BG_KEY) };

bgInput.addEventListener("change", () => {
  const v = bgInput.value.trim();
  saved.bg = v && v.toLowerCase() !== DEFAULT_BG.toLowerCase() ? v : "";
  write(BG_KEY, saved.bg);
});

urlInput.addEventListener("change", () => {
  const v = urlInput.value.trim();
  saved.url = v && v !== DEFAULT_URL ? v : "";
  write(URL_KEY, saved.url);
});
passwordInput.addEventListener("change", () => {
  saved.password = passwordInput.value;
  write(PASSWORD_KEY, saved.password);
});

button.addEventListener("click", reloadAll);

// RESET DRAFT clears all of localStorage (control.js runs first): put these back
$("reset")?.addEventListener("click", () => {
  write(URL_KEY, saved.url);
  write(PASSWORD_KEY, saved.password);
  write(BG_KEY, saved.bg);
  fillSettings(); // reset also blanks every text input, this one included
});

fillSettings();
