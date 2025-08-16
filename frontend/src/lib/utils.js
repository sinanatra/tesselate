import { DIN_SIZES_MM } from "./types.js";

export const toPx = (mm, dpm) => Math.round(mm * dpm);

export function getTargetMM({ din, width_cm, height_cm }) {
  if (width_cm && height_cm) return [width_cm * 10, height_cm * 10];
  if (din) return DIN_SIZES_MM[din];
  return [210, 297]; // default A4
}

export function drawToCanvas(img, w, h, mode) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);

  const iw = img.naturalWidth,
    ih = img.naturalHeight;
  const ir = iw / ih,
    tr = w / h;

  if (mode === "stretch") {
    ctx.drawImage(img, 0, 0, w, h);
  } else if (mode === "fit") {
    let dw = w,
      dh = Math.round(w / ir);
    if (dh > h) {
      dh = h;
      dw = Math.round(h * ir);
    }
    const dx = Math.floor((w - dw) / 2),
      dy = Math.floor((h - dh) / 2);
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    let sw = iw,
      sh = Math.round(iw / tr);
    if (sh > ih) {
      sh = ih;
      sw = Math.round(ih * tr);
    }
    const sx = Math.floor((iw - sw) / 2),
      sy = Math.floor((ih - sh) / 2);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  }
  return canvas;
}

export function rotateCanvas45(src) {
  const s = Math.ceil(
    Math.sqrt(src.width * src.width + src.height * src.height)
  );
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, s, s);
  ctx.translate(s / 2, s / 2);
  ctx.rotate(Math.PI / 4);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export function blobFromCanvas(c, type = "image/png", quality) {
  return new Promise((res) => c.toBlob((b) => res(b), type, quality));
}
