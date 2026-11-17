// Film grain: a small tile of random grey speckles, faint enough to read as texture.
// Drawn once and set as the CSS variable --grain on `el`, for backgrounds like
// `background: var(--grain, none), ...`. Used by waiting.html and cams.html.
export function applyGrain(el) {
  const size = 160;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.random() * 34;
  }
  ctx.putImageData(img, 0, 0);
  el.style.setProperty("--grain", `url(${canvas.toDataURL()})`);
}
