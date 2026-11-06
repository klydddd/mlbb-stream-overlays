// bgRemoval.js — in-browser background removal for player photos.
// Uses transformers.js + MODNet (portrait matting, Apache-2.0). The library and
// model are lazy-loaded on first use and then cached by the browser.

import { analyzeImage } from "./showLogo.js?v=2";

const TRANSFORMERS_URL =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/+esm";
const MODEL_ID = "Xenova/modnet";

// Large photos are scaled down before matting. The model works at ~512px and its
// mask is scaled back up; the photo itself is kept at up to 1600px for sharpness.
const MAX_INPUT = 1600;
// Alpha above this counts as "player" when trimming empty margins
const TRIM_ALPHA = 20;
const TRIM_PAD = 0.03; // 3% padding around the trimmed player

let loading = null;
let loaded = false;

export function isModelLoaded() {
  return loaded;
}

function loadModel(onProgress) {
  if (!loading) {
    loading = (async () => {
      const t = await import(TRANSFORMERS_URL);
      const progress_callback = (p) => {
        if (p.status === "progress" && typeof p.progress === "number") {
          onProgress?.("download", p.progress);
        }
      };
      const [model, processor] = await Promise.all([
        t.AutoModel.from_pretrained(MODEL_ID, { dtype: "fp32", progress_callback }),
        t.AutoProcessor.from_pretrained(MODEL_ID),
      ]);
      loaded = true;
      return { t, model, processor };
    })();
    // allow a retry if loading failed (e.g. offline)
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = src;
  });
}

/** Resolves true if the image already has meaningful transparency (e.g. a cut-out PNG). */
export function hasTransparency(dataUrl) {
  return new Promise((resolve) => analyzeImage(dataUrl, (r) => resolve(!!r.hasTransparency)));
}

// Crop the canvas to the bounding box of the visible (non-transparent) player.
function trimToContent(canvas) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > TRIM_ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas; // nothing detected; keep as-is

  const padX = Math.round((maxX - minX) * TRIM_PAD);
  const padY = Math.round((maxY - minY) * TRIM_PAD);
  const x0 = Math.max(0, minX - padX);
  const y0 = Math.max(0, minY - padY);
  const x1 = Math.min(w, maxX + 1 + padX);
  const y1 = Math.min(h, maxY + 1 + padY);

  const out = document.createElement("canvas");
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.getContext("2d").drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/**
 * Removes the background of a photo and returns a PNG data URL with transparency,
 * trimmed to the player.
 * onProgress(stage, pct): stage is "download" (model, pct 0-100) or "process".
 */
export async function removeBackground(dataUrl, { onProgress } = {}) {
  const { t, model, processor } = await loadModel(onProgress);
  onProgress?.("process");

  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_INPUT / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  // Predict the alpha matte
  const image = t.RawImage.fromCanvas(canvas);
  const { pixel_values } = await processor(image);
  const { output } = await model({ input: pixel_values });
  const mask = await t.RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(w, h);

  // Write the matte into the alpha channel
  const pixels = ctx.getImageData(0, 0, w, h);
  const ch = mask.channels || 1;
  for (let i = 0, n = w * h; i < n; i++) {
    pixels.data[i * 4 + 3] = mask.data[i * ch];
  }
  ctx.putImageData(pixels, 0, 0);

  return trimToContent(canvas).toDataURL("image/png");
}
