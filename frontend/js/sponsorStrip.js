// Sponsor strip: every category's logos at once (IN PARTNERSHIP WITH, PRESENTED BY,
// SPONSORED BY, OFFICIAL MONITOR), each group hidden while it has no logos.
// localStorage "sponsors" (JSON groups); messages { type: "sponsors" } and "reset".
//
// mountSponsorStrip(strip, { onChange }) works on any page whose strip element holds
// `.sponsor-group[data-group]` blocks with a `.sponsor-group-logos` box.
// onChange(hasLogos) runs whenever the strip gains or loses all its logos.
//
// display.html also has a DRAFT DISPLAY choice (js/sponsors.js on the controller):
//   "center": one-logo-at-a-time slideshow under DRAFTING (js/sponsorSlideshow.js)
//   "top":    this strip across the top area
// The choice goes on <body data-sponsor-style>, and CSS hides the version not in use.
// That part only runs when the page has #top-area (display.html).
import { onMessage } from "./websocketClient.js";

function readGroups() {
  try {
    return JSON.parse(localStorage.getItem("sponsors") || "{}") || {};
  } catch (e) {
    return {};
  }
}

const channel = new BroadcastChannel("team_channel");

export function mountSponsorStrip(strip, { onChange } = {}) {
  if (!strip) return;

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
    onChange?.(any);
  }

  function handleMessage(data) {
    if (!data || typeof data !== "object") return;
    if (data.type === "sponsors") setGroups(data.sponsors);
    else if (data.type === "reset") setGroups({});
  }

  setGroups(readGroups());
  channel.addEventListener("message", (e) => handleMessage(e.data));
  onMessage(handleMessage);
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === "sponsors") setGroups(readGroups());
  });
}

// ---------- display.html: strip vs center slideshow ----------

const topArea = document.getElementById("top-area");
if (topArea) {
  const strip = document.getElementById("top-sponsors");

  // tells css/casterCams.css whether the strip is on screen, so the cams sit below it
  const updateArea = () => {
    const shown = !strip.hidden && document.body.dataset.sponsorStyle === "top";
    topArea.classList.toggle("has-strip", shown);
  };

  const setStyle = (value) => {
    document.body.dataset.sponsorStyle = value === "top" ? "top" : "center";
    updateArea();
  };

  mountSponsorStrip(strip, { onChange: updateArea });
  setStyle(localStorage.getItem("sponsor-draft-style"));

  const handleStyle = (data) => {
    if (data?.type === "sponsor-draft-style") setStyle(data.value);
    else if (data?.type === "reset") setStyle("center");
  };
  channel.addEventListener("message", (e) => handleStyle(e.data));
  onMessage(handleStyle);
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === "sponsor-draft-style") setStyle(localStorage.getItem("sponsor-draft-style"));
  });
}
