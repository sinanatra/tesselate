export function invertGray(gray) {
  for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i];
  return gray;
}

export function floydSteinberg(gray, w, h) {
  const err = new Float32Array(gray.length);
  for (let y = 0; y < h; y++) {
    const dir = y % 2 === 0 ? 1 : -1;
    const xs = dir === 1 ? 0 : w - 1;
    const xe = dir === 1 ? w : -1;
    for (let x = xs; x !== xe; x += dir) {
      const i = y * w + x;
      const old = Math.min(255, Math.max(0, gray[i] + err[i]));
      const newVal = old < 128 ? 0 : 255;
      const e = old - newVal;
      gray[i] = newVal;
      const nx = x + dir;
      if (nx >= 0 && nx < w) err[i + dir] += (e * 7) / 16;
      if (y + 1 < h) {
        if (nx >= 0 && nx < w) err[i + w + dir] += (e * 1) / 16;
        err[i + w] += (e * 5) / 16;
        const px = x - dir;
        if (px >= 0 && px < w) err[i + w - dir] += (e * 3) / 16;
      }
    }
  }
  return gray;
}

export function halftone(gray, w, h, cell = 8) {
  const out = new Uint8ClampedArray(gray.length);
  out.fill(255);
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const x1 = Math.min(x + cell, w),
        y1 = Math.min(y + cell, h);
      let sum = 0,
        cnt = 0;
      for (let yy = y; yy < y1; yy++)
        for (let xx = x; xx < x1; xx++) {
          sum += gray[yy * w + xx];
          cnt++;
        }
      const avg = sum / cnt;
      const radius = Math.max(
        0,
        Math.min(cell / 2, (1 - avg / 255) * (cell / 2))
      );
      const cx = x + Math.floor((x1 - x) / 2);
      const cy = y + Math.floor((y1 - y) / 2);
      const r2 = radius * radius;
      for (let yy = -Math.floor(radius); yy <= Math.floor(radius); yy++) {
        for (let xx = -Math.floor(radius); xx <= Math.floor(radius); xx++) {
          if (xx * xx + yy * yy <= r2) {
            const X = cx + xx,
              Y = cy + yy;
            if (X >= 0 && X < w && Y >= 0 && Y < h) out[Y * w + X] = 0;
          }
        }
      }
    }
  }
  return out;
}
