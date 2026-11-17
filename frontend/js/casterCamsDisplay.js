// Caster cams on display.html (one or two vdo.ninja feeds, large and centered in the
// empty area above the draft overlay) and on cams.html (the cams-only screen; same
// element ids). Controlled by js/casterCams.js on the controller.
// Listens on localStorage (restore + storage events), BroadcastChannel and WebSocket.
//
// OBS cam sources (controller CASTER CAMS > OBS CAM SOURCES, js/obsWebsocket/camSources.js):
// with localStorage "caster-cams-obs" = "1" (sent as `obs: true`), the feeds play in their
// own OBS sources (cam-feed.html), which stay loaded while the draft source switches pages.
// Then these pages keep the empty frames, load no feed, and report where each frame is:
//   { type: "cam-layout", page, viewport: {w, h}, rects: [{x, y, w, h} | null, ...] }
// (WebSocket; viewport pixels, inside the coloured top border). The controller moves the
// OBS sources onto them. Which page reports: root data-report = "always" (display.html) or
// "chain" (cams.html: only as the draft source, not as a standalone cams source).
// cam-feed.html sets data-only = N: it plays just that cam, whatever the OBS setting.
import { onMessage, send } from "./websocketClient.js";
import { readCasterView, readGlobalView, camTransform } from "./casterView.js";

const root = document.getElementById("caster-cams");
const cams = [...root.querySelectorAll(".caster-cam")];
const only = Number(root.dataset.only) || 0;    // cam-feed.html: the one cam it plays
const reportMode = root.dataset.report || "";   // "always" | "chain" | ""
let obsMode = false;                             // feeds play in OBS sources instead

// vdo.ninja viewer options that make each feed cheaper to play inside OBS
// (AUDIT_OPTIMIZATION.md #1): H.264 so the graphics card decodes it, at most 30 fps, and
// no audio, because the casters' audio reaches OBS another way (no second decode, no echo).
// Options already in the link win.
const VDO_DEFAULTS = { codec: "h264", maxframerate: "30", noaudio: "" };
const VDO_ALIASES = { maxframerate: ["mfr", "maxfps"] };

function tuneCamLink(link) {
  let url;
  try { url = new URL(link); } catch { return link; }
  if (!/(^|\.)vdo\.ninja$/i.test(url.hostname)) return link;
  for (const [key, value] of Object.entries(VDO_DEFAULTS)) {
    const names = [key, ...(VDO_ALIASES[key] || [])];
    if (!names.some((n) => url.searchParams.has(n))) url.searchParams.set(key, value);
  }
  return url.toString();
}

function setCam(cam, caster, visible, globalView) {
  const index = cams.indexOf(cam) + 1;
  cam.hidden = !visible || (only > 0 && index !== only); // cam-feed.html shows just its cam
  const frame = cam.querySelector("iframe");
  // zoom / position / mirror (js/casterView.js); only the transform changes, never the src
  frame.style.transform = camTransform(globalView, caster?.view);
  const plays = visible && (only ? index === only : !obsMode);
  const raw = plays ? (caster?.link || "").trim() : "";
  const link = raw ? tuneCamLink(raw) : "";
  // only touch src when it changes, so a live feed doesn't reconnect on every name edit;
  // a hidden cam drops its feed (no hidden audio/video still playing)
  if (frame.dataset.src !== link) {
    frame.dataset.src = link;
    if (link) frame.src = link;
    else frame.removeAttribute("src");
  }
  // in OBS mode the frame stays empty on purpose (the OBS source covers it)
  cam.classList.toggle("no-feed", !link && !(visible && obsMode && !only));
  cam.querySelector(".caster-cam-name").textContent = (caster?.name || "").trim() || "CASTER";
}

function render({ layout, casters, view, obs } = {}) {
  const count = layout === "1" ? 1 : layout === "2" ? 2 : 0;
  obsMode = !!obs;
  root.hidden = !count;
  root.dataset.count = String(count);
  root.classList.toggle("obs-cams", obsMode && !only);
  cams.forEach((cam, i) => setCam(cam, casters?.[i], i < count, view));
  scheduleReport();
}

// ---------- frame positions for the OBS cam sources ----------

function reports() {
  if (only || !obsMode) return false;
  if (reportMode === "always") return true;
  if (reportMode === "chain") {
    try { return sessionStorage.getItem("overlay-chain") === "1"; } catch { return false; }
  }
  return false;
}

// where the video goes: the frame's inside (below its coloured top border), in viewport
// pixels, page scaling included (cams.html scales a 1920x1080 stage)
function frameRect(cam) {
  if (cam.hidden || root.hidden) return null;
  const frame = cam.querySelector(".caster-cam-frame");
  const r = frame.getBoundingClientRect();
  if (!r.width || !frame.offsetWidth) return null;
  const k = r.width / frame.offsetWidth;
  const round = (v) => Math.round(v * 10) / 10;
  return {
    x: round(r.left + frame.clientLeft * k),
    y: round(r.top + frame.clientTop * k),
    w: round(frame.clientWidth * k),
    h: round(frame.clientHeight * k),
  };
}

function sendReport() {
  if (!reports()) return;
  send({
    type: "cam-layout",
    page: document.body.dataset.camPage || location.pathname.split("/").pop(),
    viewport: { w: window.innerWidth, h: window.innerHeight },
    rects: cams.map(frameRect),
  });
}

// Measure once the cams' own intro animations (and the page's, on the cams' ancestors)
// have finished, so slide-ins don't skew the numbers; give up waiting after 3 s.
let reportTimer = null;
function scheduleReport() {
  if (!reports()) return;
  clearTimeout(reportTimer);
  reportTimer = setTimeout(async () => {
    const moving = document.getAnimations().filter((a) => {
      const t = a.effect?.target;
      const finite = Number.isFinite(a.effect?.getComputedTiming?.().endTime);
      return finite && t instanceof Element && (root.contains(t) || t.contains(root));
    });
    await Promise.race([
      Promise.allSettled(moving.map((a) => a.finished)),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    sendReport();
  }, 50);
}

window.addEventListener("resize", scheduleReport);
// the relay may come up after the first render: send again a few times early on
[1500, 4000, 8000].forEach((ms) => setTimeout(sendReport, ms));

function fromStorage() {
  const ls = (k) => localStorage.getItem(k) || "";
  return {
    layout: ls("caster-layout"),
    view: readGlobalView(ls),
    obs: ls("caster-cams-obs") === "1",
    casters: [1, 2].map((n) => ({
      name: ls(`caster-name-${n}`),
      link: ls(`caster-link-${n}`),
      view: readCasterView(ls, n),
    })),
  };
}

function handleMessage(data) {
  if (!data || typeof data !== "object") return;
  if (data.type === "caster-cams") render(data);
  else if (data.type === "reset") render({ obs: obsMode });
  else if (data.type === "cam-layout-request") sendReport(); // controller just turned OBS cams on
}

render(fromStorage());

const channel = new BroadcastChannel("team_channel");
channel.addEventListener("message", (e) => handleMessage(e.data));
onMessage(handleMessage);
window.addEventListener("storage", (e) => {
  if (e.key === null || e.key.startsWith("caster-")) render(fromStorage());
});
