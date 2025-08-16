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

  for (let i = 0; i < strips.length; i++) {
    const id = strips[i];
    const bytesPerRow = Math.ceil(id.width / 8);
    const buf = new Uint8Array(bytesPerRow * id.height);

    for (let y = 0; y < id.height; y++) {
      for (let x = 0; x < id.width; x++) {
        const p = (y * id.width + x) * 4;
        const bit = id.data[p] < 128 ? 1 : 0;
        const bindex = y * bytesPerRow + (x >> 3);
        const bitIndex = 7 - (x & 7);
        buf[bindex] |= bit << bitIndex;
      }
    }

    const m = 0;
    const xL = bytesPerRow & 0xff,
      xH = (bytesPerRow >> 8) & 0xff;
    const yL = id.height & 0xff,
      yH = (id.height >> 8) & 0xff;
    await write([0x1d, 0x76, 0x30, m, xL, xH, yL, yH]);

    const CHUNK = 16384;
    for (let off = 0; off < buf.length; off += CHUNK) {
      await device.transferOut(
        endpoint,
        buf.subarray(off, Math.min(off + CHUNK, buf.length))
      );
    }

    await write([0x1b, 0x64, 0x02]);

    if (pause && i < strips.length - 1) {
      if (!confirm(`Strip ${i + 1}/${strips.length} printed. Continue?`)) break;
    }
  }

  if (cut) await write([0x1d, 0x56, 0x00]);
}
