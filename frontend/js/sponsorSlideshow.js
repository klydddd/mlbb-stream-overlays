// Sponsor logo slideshow, shared by gameDisplay.html (top-right white area) and
// display.html (center column under DRAFTING). Data comes from the controller's
// SPONSOR SLIDESHOW panel (js/sponsors.js):
//   localStorage "sponsors" JSON { partner: [dataUrl], presented: [...], sponsored: [...], monitor: [...] }
//   localStorage "sponsor-interval" seconds per logo
//   message { type: "sponsors", sponsors, interval }; "reset" clears it
//
// A category with up to SIDE_BY_SIDE logos is one slide showing them side by side;
// a bigger category rotates one logo per slide.
//
// Markup expected inside the root element (root starts hidden):
//   <div class="sponsor-slide"><span class="sponsor-label"></span><div class="sponsor-logos"></div></div>  x2
import { onMessage } from "./websocketClient.js";

const LABELS = {
  partner: "IN PARTNERSHIP WITH",
  presented: "PRESENTED BY",
  sponsored: "SPONSORED BY",
  monitor: "OFFICIAL MONITOR",
};
const SIDE_BY_SIDE = 2;

export function mountSponsorSlideshow(root) {
  if (!root) return;
  const slides = [...root.querySelectorAll(".sponsor-slide")];
  let list = [];     // slides in category order: [{ label, srcs: [dataUrl, ...] }]
  let index = 0;
  let front = 0;     // which of the two slide elements is showing
  let timer = null;
  let seconds = 5;

  function show(i) {
    const item = list[i];
    // fill the hidden slide, then crossfade to it
    const next = slides[1 - front];
    next.querySelector(".sponsor-label").textContent = item.label;
    const logos = next.querySelector(".sponsor-logos");
    logos.innerHTML = "";
    logos.dataset.count = String(item.srcs.length);
    item.srcs.forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      logos.appendChild(img);
    });
    next.classList.add("active");
    slides[front].classList.remove("active");
    front = 1 - front;
  }

  function set(groups, interval) {
    list = [];
    Object.keys(LABELS).forEach((g) => {
      const srcs = Array.isArray(groups?.[g]) ? groups[g] : [];
      if (!srcs.length) return;
      if (srcs.length <= SIDE_BY_SIDE) list.push({ label: LABELS[g], srcs });
      else srcs.forEach((src) => list.push({ label: LABELS[g], srcs: [src] }));
    });
    const s = parseFloat(interval);
    if (s >= 1) seconds = s;

    clearInterval(timer);
    root.hidden = !list.length;
    if (!list.length) {
      slides.forEach((el) => el.classList.remove("active"));
      return;
    }
    index = Math.min(index, list.length - 1);
    show(index);
    if (list.length > 1) {
      timer = setInterval(() => {
        index = (index + 1) % list.length;
        show(index);
      }, seconds * 1000);
    }
  }

  function loadFromStorage() {
    let groups = {};
    try {
      groups = JSON.parse(localStorage.getItem("sponsors") || "{}") || {};
    } catch (e) { /* ignore */ }
    set(groups, localStorage.getItem("sponsor-interval"));
  }

  function handleMessage(data) {
    if (data?.type === "sponsors") set(data.sponsors, data.interval);
    else if (data?.type === "reset") set({});
  }

  loadFromStorage();

  const channel = new BroadcastChannel("team_channel");
  channel.addEventListener("message", (e) => handleMessage(e.data));
  onMessage(handleMessage);
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === "sponsors" || e.key === "sponsor-interval") loadFromStorage();
  });
}
