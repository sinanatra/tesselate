import { floydSteinberg, halftone, invertGray } from "./dither.js";

self.onmessage = (e) => {
  try {
    const { imageData, settings } = e.data;
    const { width, height } = imageData;

    let gray = new Uint8ClampedArray(imageData.data.length / 4);
    for (let i = 0, j = 0; i < imageData.data.length; i += 4, j++) {
      const r = imageData.data[i],
        g = imageData.data[i + 1],
        b = imageData.data[i + 2];
      gray[j] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
    if (settings.invert) gray = invertGray(gray);

    if (settings.dither === "floyd") gray = floydSteinberg(gray, width, height);
    else if (settings.dither === "halftone")
      gray = halftone(gray, width, height, settings.halftone_cell);

    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < out.length; i += 4, j++) {
      const v = gray[j] < 128 ? 0 : 255;
      out[i] = out[i + 1] = out[i + 2] = v;
      out[i + 3] = 255;
    }
    const id = new ImageData(out, width, height);
    postMessage({ ok: true, imageData: id }, [id.data.buffer]);
  } catch (err) {
    postMessage({
      ok: false,
      error: (err && (err.stack || err.message)) || String(err),
    });
  }
};
