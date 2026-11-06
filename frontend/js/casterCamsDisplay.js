// Caster cams on display.html: one or two vdo.ninja feeds, large and centered in the
// empty area above the draft overlay. Controlled by js/casterCams.js on the controller.
// Listens on localStorage (restore + storage events), BroadcastChannel and WebSocket.
import { onMessage } from "./websocketClient.js";

const root = document.getElementById("caster-cams");
const cams = [...root.querySelectorAll(".caster-cam")];

function setCam(cam, caster, visible) {
  cam.hidden = !visible;
  const frame = cam.querySelector("iframe");
  const link = visible ? (caster?.link || "").trim() : "";
  // only touch src when it changes, so a live feed doesn't reconnect on every name edit;
  // a hidden cam drops its feed (no hidden audio/video still playing)
  if (frame.dataset.src !== link) {
    frame.dataset.src = link;
    if (link) frame.src = link;
    else frame.removeAttribute("src");
  }
  cam.classList.toggle("no-feed", !link);
  cam.querySelector(".caster-cam-name").textContent = (caster?.name || "").trim() || "CASTER";
}

function render({ layout, casters } = {}) {
  const count = layout === "1" ? 1 : layout === "2" ? 2 : 0;
  root.hidden = !count;
  root.dataset.count = String(count);
  cams.forEach((cam, i) => setCam(cam, casters?.[i], i < count));
}

function fromStorage() {
  const ls = (k) => localStorage.getItem(k) || "";
  return {
    layout: ls("caster-layout"),
    casters: [1, 2].map((n) => ({ name: ls(`caster-name-${n}`), link: ls(`caster-link-${n}`) })),
  };
}

function handleMessage(data) {
  if (!data || typeof data !== "object") return;
  if (data.type === "caster-cams") render(data);
  else if (data.type === "reset") render({});
}

render(fromStorage());

const channel = new BroadcastChannel("team_channel");
channel.addEventListener("message", (e) => handleMessage(e.data));
onMessage(handleMessage);
window.addEventListener("storage", (e) => {
  if (e.key === null || e.key.startsWith("caster-")) render(fromStorage());
});
