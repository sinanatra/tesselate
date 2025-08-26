export async function printStripsWebUSB(
  strips,
  {
    pause = true,
    cut = true,
    vendorIdHex = "",
    productIdHex = "",
    iface = 0,
    endpoint = 1,
    align = "left",
    preCutFeed = 3,
    postStripFeed = 2,
    maxRowsPerRaster = 256,
  } = {}
) {
  if (!("usb" in navigator)) throw new Error("WebUSB not supported");

  const filters = [];
  if (vendorIdHex) {
    const v = parseInt(vendorIdHex, 16);
    if (Number.isFinite(v)) {
      const p = productIdHex ? parseInt(productIdHex, 16) : undefined;
      filters.push(p ? { vendorId: v, productId: p } : { vendorId: v });
    }
  }
  const device = await navigator.usb.requestDevice({
    filters: filters.length ? filters : [{}],
  });

  await device.open();
  if (device.configuration == null) await device.selectConfiguration(1);
  await device.claimInterface(iface);

  const write = (data) => device.transferOut(endpoint, new Uint8Array(data));

  await write([0x1b, 0x40]);
  const alignMap = { left: 0x00, center: 0x01, right: 0x02 };
  await write([0x1b, 0x61, alignMap[align] ?? 0x00]);

  const doCut = async () => {
    if (!cut) return;
    const feed = Math.max(0, Math.min(20, Math.floor(preCutFeed)));
    if (feed) await write([0x1b, 0x64, feed]);
    const seqs = [
      [0x1d, 0x56, 0x42, 0x00],
      [0x1d, 0x56, 0x42, 0x01],
      [0x1d, 0x56, 0x00],
      [0x1d, 0x56, 0x01],
    ];
    for (const s of seqs) {
      try {
        await write(s);
        return;
      } catch {}
    }
  };

  for (let i = 0; i < strips.length; i++) {
    const id = strips[i];
    const W = id.width;
    const H = id.height;
    const bytesPerRow = Math.ceil(W / 8);

    const buf = new Uint8Array(bytesPerRow * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = (y * W + x) * 4;
        const bit = id.data[p] < 128 ? 1 : 0;
        const bindex = y * bytesPerRow + (x >> 3);
        buf[bindex] |= bit << (7 - (x & 7));
      }
    }

    const MAX_ROWS = Math.max(1, Math.min(1024, Math.floor(maxRowsPerRaster)));
    for (let y0 = 0; y0 < H; y0 += MAX_ROWS) {
      const rows = Math.min(MAX_ROWS, H - y0);
      const xL = bytesPerRow & 0xff,
        xH = (bytesPerRow >> 8) & 0xff;
      const yL = rows & 0xff,
        yH = (rows >> 8) & 0xff;

      await write([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);

      const start = y0 * bytesPerRow;
      const end = (y0 + rows) * bytesPerRow;
      const band = buf.subarray(start, end);

      const CHUNK = 16384;
      for (let off = 0; off < band.length; off += CHUNK) {
        await device.transferOut(
          endpoint,
          band.subarray(off, Math.min(off + CHUNK, band.length))
        );
      }
    }

    const push = Math.max(0, Math.min(20, Math.floor(postStripFeed)));
    if (push) await write([0x1b, 0x64, push]);

    await doCut();

    if (pause && i < strips.length - 1) {
      const cont = confirm(
        `Strip ${i + 1}/${strips.length} printed. Continue?`
      );
      if (!cont) break;
    }
  }
}
