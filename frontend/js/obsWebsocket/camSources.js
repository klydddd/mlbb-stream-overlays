// OBS CAM SOURCES (controller CASTER CAMS panel): play the caster cams in their own OBS
// browser sources, so the vdo.ninja feeds stay loaded while the draft source switches
// between display.html and cams.html (each switch loads a new page, which would restart
// any feed inside it).
//
// Turning it on:
//   1. finds the draft source: an OBS browser source showing display.html / cams.html /
//      heroes-display.html / gameDisplay.html (this room's, when the URL has one),
//   2. creates or updates "Caster Cam 1" and "Caster Cam 2" (cam-feed.html?room=..&cam=N,
//      1280x720, next to the draft source's URL) in every scene holding it, just above it,
//   3. sets localStorage "caster-cams-obs" = "1"; js/casterCams.js sends it as `obs: true`,
//      so display.html and cams.html stop loading the feeds and report their frames.
// While it is on:
//   - each { type: "cam-layout", page, viewport, rects } from the page on screen moves the
//     cam sources onto its frames (mapped through the draft source's position and size) and
//     shows them; a cam with no frame is hidden,
//   - every SHOW DRAFT / HEROES / INGAME / CAMS switch hides them first; the new page
//     reports when it is up (heroes and ingame have no cams, so they stay hidden).
// Assumes the draft source isn't rotated or cropped and is anchored top-left (OBS default).
// Turning it off hides the cam sources and the pages play the feeds themselves again.
import { connectSaved, errorText, read, write } from "./obsClient.js";
import { onMessage, send } from "../websocketClient.js";

const KEY = "caster-cams-obs";
const CHAIN_KEY = "obs-cam-chain";         // names of the draft source(s) found at setup
const CAMS = [1, 2];
const camName = (n) => `Caster Cam ${n}`;
const FEED = { width: 1280, height: 720 };
const CHAIN_PAGE = /\/(display|cams|heroes-display|gameDisplay)\.html$/i;
const PAGE_OF_TARGET = { draft: "draft", cams: "cams", heroes: "heroes", ingame: "ingame" };

const $ = (id) => document.getElementById(id);
const button = $("caster-obs-toggle");
const status = $("caster-obs-status");
const room = new URLSearchParams(location.search).get("room") || "";

// RESET DRAFT clears all of localStorage (control.js runs first): this is setup, so it is
// kept in memory too and written back (see the reset listener at the bottom)
const saved = { on: read(KEY), chain: read(CHAIN_KEY) };
function setOn(on) {
  saved.on = on ? "1" : "";
  write(KEY, saved.on);
}

let onScreen = null; // page the draft source is on, as last switched here (null = not known yet)

function setStatus(text, kind = "") {
  if (!status) return;
  status.textContent = text;
  status.dataset.kind = kind;
}

const isOn = () => read(KEY) === "1";

function render() {
  button?.setAttribute("aria-pressed", String(isOn()));
}

// tell the pages (via js/casterCams.js, which owns the caster-cams message)
function announce() {
  window.dispatchEvent(new Event("caster-cams-broadcast"));
}

// one OBS job at a time, in order
let queue = Promise.resolve();
function enqueue(job) {
  queue = queue.then(job).catch((err) => setStatus(errorText(err), "error"));
  return queue;
}

async function withObs(fn) {
  const obs = await connectSaved();
  try { return await fn(obs); } finally { obs.close(); }
}

// every scene's items: [{ sceneName, items }]
async function allScenes(obs) {
  const { scenes = [] } = await obs.request("GetSceneList");
  const out = [];
  for (const { sceneName } of scenes) {
    const { sceneItems = [] } = await obs.request("GetSceneItemList", { sceneName }).catch(() => ({}));
    out.push({ sceneName, items: sceneItems });
  }
  return out;
}

const chainNames = () => {
  try { return JSON.parse(read(CHAIN_KEY) || "[]"); } catch { return []; }
};

// ---------- setup ----------

async function findChainSources(obs) {
  const { inputs = [] } = await obs.request("GetInputList");
  const browsers = inputs.filter((i) => (i.unversionedInputKind || i.inputKind) === "browser_source");
  const found = [];
  for (const { inputName } of browsers) {
    if (CAMS.some((n) => camName(n) === inputName)) continue;
    const { inputSettings = {} } = await obs.request("GetInputSettings", { inputName }).catch(() => ({}));
    let url;
    try { url = new URL(inputSettings.url || ""); } catch { continue; }
    if (CHAIN_PAGE.test(url.pathname)) found.push({ inputName, url });
  }
  const sameRoom = found.filter((f) => f.url.searchParams.get("room") === room);
  return { sources: sameRoom.length ? sameRoom : found, existing: new Set(browsers.map((b) => b.inputName)) };
}

function feedUrl(chainUrl, n) {
  const url = new URL("cam-feed.html", chainUrl);
  url.search = "";
  if (room) url.searchParams.set("room", room);
  url.searchParams.set("cam", String(n));
  return url.toString();
}

// put the cam right above the draft source in its scene
async function placeAbove(obs, sceneName, camId, chainId) {
  const index = async (sceneItemId) =>
    (await obs.request("GetSceneItemIndex", { sceneName, sceneItemId })).sceneItemIndex;
  const chainIndex = await index(chainId);
  const camIndex = await index(camId);
  const target = camIndex < chainIndex ? chainIndex : chainIndex + 1;
  if (target !== camIndex) await obs.request("SetSceneItemIndex", { sceneName, sceneItemId: camId, sceneItemIndex: target });
}

async function setup() {
  return withObs(async (obs) => {
    setStatus("SETTING UP OBS CAMS…");
    const { sources, existing } = await findChainSources(obs);
    if (!sources.length) {
      throw new Error("NO DRAFT SOURCE IN OBS · ADD A BROWSER SOURCE SHOWING display.html FIRST");
    }
    const names = sources.map((s) => s.inputName);
    saved.chain = JSON.stringify(names);
    write(CHAIN_KEY, saved.chain);

    const settings = (n) => ({
      url: feedUrl(sources[0].url, n),
      width: FEED.width,
      height: FEED.height,
      reroute_audio: false,
      shutdown: false,            // keep the feed running when the cam is hidden
      restart_when_active: false,
    });
    for (const n of CAMS) {
      if (existing.has(camName(n))) {
        await obs.request("SetInputSettings", { inputName: camName(n), inputSettings: settings(n) });
      }
    }

    let scenesDone = 0;
    for (const { sceneName, items } of await allScenes(obs)) {
      const chainItem = items.find((it) => names.includes(it.sourceName));
      if (!chainItem) continue;
      scenesDone++;
      for (const n of CAMS) {
        let camItem = items.find((it) => it.sourceName === camName(n));
        let sceneItemId = camItem?.sceneItemId;
        if (!sceneItemId) {
          if (existing.has(camName(n))) {
            ({ sceneItemId } = await obs.request("CreateSceneItem", {
              sceneName, sourceName: camName(n), sceneItemEnabled: false,
            }));
          } else {
            ({ sceneItemId } = await obs.request("CreateInput", {
              sceneName, inputName: camName(n), inputKind: "browser_source",
              inputSettings: settings(n), sceneItemEnabled: false,
            }));
            existing.add(camName(n));
          }
        } else {
          await obs.request("SetSceneItemEnabled", { sceneName, sceneItemId, sceneItemEnabled: false });
        }
        await placeAbove(obs, sceneName, sceneItemId, chainItem.sceneItemId);
      }
    }
    setStatus(`OBS CAMS READY · ${names.join(", ").toUpperCase()} IN ${scenesDone} SCENE${scenesDone === 1 ? "" : "S"}`, "ok");
  });
}

// ---------- show / hide / move ----------

async function hideAll() {
  return withObs(async (obs) => {
    for (const { sceneName, items } of await allScenes(obs)) {
      for (const it of items) {
        if (!CAMS.some((n) => camName(n) === it.sourceName) || !it.sceneItemEnabled) continue;
        await obs.request("SetSceneItemEnabled", { sceneName, sceneItemId: it.sceneItemId, sceneItemEnabled: false });
      }
    }
  });
}

async function place(report) {
  const names = chainNames();
  return withObs(async (obs) => {
    let shown = 0;
    for (const { sceneName, items } of await allScenes(obs)) {
      const chainItem = items.find((it) => names.includes(it.sourceName));
      if (!chainItem) continue;
      const { sceneItemTransform: t } = await obs.request("GetSceneItemTransform", {
        sceneName, sceneItemId: chainItem.sceneItemId,
      });
      const width = t.width || t.sourceWidth * t.scaleX;
      const height = t.height || t.sourceHeight * t.scaleY;
      if (!width || !height) continue;
      const kx = width / report.viewport.w;
      const ky = height / report.viewport.h;
      for (const n of CAMS) {
        const camItem = items.find((it) => it.sourceName === camName(n));
        if (!camItem) continue;
        const rect = report.rects?.[n - 1];
        if (rect && rect.w > 0 && rect.h > 0) {
          await obs.request("SetSceneItemTransform", {
            sceneName,
            sceneItemId: camItem.sceneItemId,
            sceneItemTransform: {
              positionX: t.positionX + rect.x * kx,
              positionY: t.positionY + rect.y * ky,
              alignment: 5, // top-left
              rotation: 0,
              cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0,
              boundsType: "OBS_BOUNDS_STRETCH",
              boundsAlignment: 0,
              boundsWidth: rect.w * kx,
              boundsHeight: rect.h * ky,
            },
          });
          shown++;
        }
        await obs.request("SetSceneItemEnabled", {
          sceneName, sceneItemId: camItem.sceneItemId, sceneItemEnabled: !!rect,
        });
      }
    }
    setStatus(shown ? `OBS CAMS ON ${report.page.toUpperCase()}` : "OBS CAMS HIDDEN", "ok");
  });
}

// ---------- events ----------

onMessage((data) => {
  if (data?.type !== "cam-layout" || !isOn() || !data.viewport?.w) return;
  // a page that is leaving (its outro) can still report; only the page on screen counts
  if (onScreen && data.page !== onScreen) return;
  enqueue(() => place(data));
});

window.addEventListener("draft-display-switch", (e) => {
  onScreen = PAGE_OF_TARGET[e.detail?.target] || "draft";
  if (!isOn()) return;
  enqueue(hideAll);
  // same page again (no reload, so no fresh report): ask it once its outro would be over
  setTimeout(() => send({ type: "cam-layout-request" }), 1500);
});

button?.addEventListener("click", () => {
  if (isOn()) {
    setOn(false);
    render();
    announce();
    enqueue(async () => {
      await hideAll();
      setStatus("OBS CAMS OFF · THE PAGES PLAY THE CAMS AGAIN", "ok");
    });
    return;
  }
  enqueue(async () => {
    try {
      await setup();
    } catch (err) {
      setStatus(errorText(err), "error");
      return;
    }
    setOn(true);
    render();
    announce();
    send({ type: "cam-layout-request" });
  });
});

window.addEventListener("storage", (e) => {
  if (e.key === KEY) { saved.on = e.newValue || ""; render(); } // another controller tab
});
$("reset")?.addEventListener("click", () => {
  write(KEY, saved.on);
  write(CHAIN_KEY, saved.chain);
  render();
});

render();
