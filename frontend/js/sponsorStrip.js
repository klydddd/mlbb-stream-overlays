// display.html sponsor options. The controller's DRAFT DISPLAY toggle (js/sponsors.js) picks one:
//   "center": one-logo-at-a-time slideshow under DRAFTING (js/sponsorSlideshow.js)
//   "top":    static strip across the top area showing every category's logos at once (this file)
// The choice goes on <body data-sponsor-style>, and CSS hides the version not in use.
//
// localStorage "sponsors" (JSON groups) + "sponsor-draft-style"; messages
// { type: "sponsors" }, { type: "sponsor-draft-style", value }, and "reset".
import { onMessage } from "./websocketClient.js";

const strip = document.getElementById("top-sponsors");
const topArea = document.getElementById("top-area");

function setStyle(value) {
  document.body.dataset.sponsorStyle = value === "top" ? "top" : "center";
  updateArea();
}

function setGroups(groups) {
  let any = false;
  strip.querySelectorAll(".sponsor-group").forEach((group) => {
    const logos = Array.isArray(groups?.[group.dataset.group]) ? groups[group.dataset.group] : [];
    const box = group.querySelector(".sponsor-group-logos");
    box.innerHTML = "";
    logos.forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      box.appendChild(img);
    });
    group.hidden = !logos.length;
    any = any || logos.length > 0;
  });
  strip.hidden = !any;
  updateArea();
}

// tells css/casterCams.css whether the strip is on screen, so the cams sit below it
function updateArea() {
  const shown = !strip.hidden && document.body.dataset.sponsorStyle === "top";
  topArea.classList.toggle("has-strip", shown);
}

function loadFromStorage() {
  let groups = {};
  try {
    groups = JSON.parse(localStorage.getItem("sponsors") || "{}") || {};
  } catch (e) { /* ignore */ }
  setGroups(groups);
  setStyle(localStorage.getItem("sponsor-draft-style"));
}

function handleMessage(data) {
  if (!data || typeof data !== "object") return;
  if (data.type === "sponsors") setGroups(data.sponsors);
  else if (data.type === "sponsor-draft-style") setStyle(data.value);
  else if (data.type === "reset") {
    setGroups({});
    setStyle("center");
  }
}

loadFromStorage();

const channel = new BroadcastChannel("team_channel");
channel.addEventListener("message", (e) => handleMessage(e.data));
onMessage(handleMessage);
window.addEventListener("storage", (e) => {
  if (e.key === null || e.key === "sponsors" || e.key === "sponsor-draft-style") loadFromStorage();
});
