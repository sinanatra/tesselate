<script>
  import { onMount } from "svelte";
  import JSZip from "jszip";
  import { din_sizes } from "$lib/types.js";
  import {
    getTargetMM,
    toPx,
    drawToCanvas,
    rotateCanvas45,
    blobFromCanvas,
  } from "$lib/utils.js";
  import { printStripsWebUSB } from "$lib/escpos.js";

  let imgEl = null;
  let imageURL = "";
  let fileInput;
  let statusMsg = "";

  let s = {
    din: "A3",
    width_cm: undefined,
    height_cm: undefined,
    printer_dots_per_mm: 8,
    strip_mm: 60,
    mode: "fit",
    dither: "floyd",
    halftone_cell: 8,
    invert: false,
    direction: "vertical",
    printer_max_width_px: 576,
    pixel_size_px: 1,
  };

  let printer = {
    vendorIdHex: "",
    productIdHex: "",
    iface: 0,
    endpoint: 1,
    align: "left",
    pause: true,
    cut: true,
  };

  let strips = [];
  let busy = false;
  let fullCanvas = null; // <-- NEW: holds full processed page (before slicing)
  const DIN_KEYS = Object.keys(din_sizes);

  function setStatus(m) {
    statusMsg = m ?? "";
  }

  onMount(async () => {
    try {
      imageURL = "palm.jpg";
      await loadFromURL();
    } catch (e) {
      console.warn("Could not load default image", e);
      setStatus("Load an image to begin.");
    }
  });

  async function onFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    imageURL = URL.createObjectURL(f);
    await loadFromURL();
  }

  async function loadFromURL() {
    if (!imageURL) return;
    imgEl = new Image();
    imgEl.crossOrigin = "anonymous";
    imgEl.src = imageURL;
    await imgEl.decode();
    await generateStrips();
  }

  function pixelateImageData(id, block = 1) {
    block = Math.max(1, Math.floor(block || 1));
    if (block <= 1) return id;
    const { width: w, height: h, data } = id;
    for (let y = 0; y < h; y += block) {
      for (let x = 0; x < w; x += block) {
        const k0 = (y * w + x) * 4;
        const v = data[k0];
        for (let yy = y; yy < Math.min(y + block, h); yy++) {
          for (let xx = x; xx < Math.min(x + block, w); xx++) {
            const k = (yy * w + xx) * 4;
            data[k] = data[k + 1] = data[k + 2] = v;
            data[k + 3] = 255;
          }
        }
      }
    }
    return id;
  }

  async function generateStrips() {
    if (!imgEl) return;
    busy = true;
    setStatus("Processing…");
    strips = [];
    fullCanvas = null;

    const [wmm, hmm] = getTargetMM(s);
    const tw = toPx(wmm, s.printer_dots_per_mm);
    const th = toPx(hmm, s.printer_dots_per_mm);
    let src = drawToCanvas(imgEl, tw, th, s.mode);
    if (s.direction === "diagonal") src = rotateCanvas45(src);

    const ctx = src.getContext("2d");
    const id = ctx.getImageData(0, 0, src.width, src.height);
    const worker = new Worker(new URL("../lib/worker.js", import.meta.url), {
      type: "module",
    });
    const processed = await new Promise((resolve, reject) => {
      worker.onmessage = (ev) => {
        if (!ev.data?.ok) {
          reject(new Error(ev.data?.error || "Worker failed"));
          worker.terminate();
          return;
        }
        resolve(ev.data.imageData);
        worker.terminate();
      };
      worker.onerror = (e) => reject(e);
      worker.postMessage({ imageData: id, settings: s }, [id.data.buffer]);
    });

    pixelateImageData(processed, Number(s.pixel_size_px) || 1);

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = processed.width;
    sourceCanvas.height = processed.height;
    sourceCanvas.getContext("2d").putImageData(processed, 0, 0);
    fullCanvas = sourceCanvas;

    const stripPx = toPx(s.strip_mm, s.printer_dots_per_mm);

    if (s.direction === "vertical") {
      const count = Math.ceil(sourceCanvas.width / stripPx);
      for (let i = 0; i < count; i++) {
        const x0 = i * stripPx;
        const sw = Math.min(stripPx, sourceCanvas.width - x0);
        const h = sourceCanvas.height;

        const c = document.createElement("canvas");
        c.width = stripPx;
        c.height = h;

        const g = c.getContext("2d");
        g.fillStyle = "#fff";
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(sourceCanvas, x0, 0, sw, h, 0, 0, sw, h);

        strips.push({
          canvas: c,
          name: `vstrip_${String(i + 1).padStart(2, "0")}.png`,
        });
      }
    } else if (s.direction === "horizontal") {
      const count = Math.ceil(sourceCanvas.height / stripPx);
      const temp = [];

      for (let i = 0; i < count; i++) {
        const y0 = i * stripPx;
        const hSlice = Math.min(stripPx, sourceCanvas.height - y0);
        const w = sourceCanvas.width;

        const tmp = document.createElement("canvas");
        tmp.width = w;
        tmp.height = stripPx;
        const tctx = tmp.getContext("2d");
        tctx.fillStyle = "#fff";
        tctx.fillRect(0, 0, w, stripPx);
        tctx.drawImage(sourceCanvas, 0, y0, w, hSlice, 0, 0, w, hSlice);

        const c = document.createElement("canvas");
        c.width = stripPx;
        c.height = w;
        const x = c.getContext("2d");
        x.translate(stripPx, 0);
        x.rotate(Math.PI / 2);
        x.imageSmoothingEnabled = false;
        x.drawImage(tmp, 0, 0);

        let out = c;
        if (c.width !== s.printer_max_width_px) {
          const scaled = document.createElement("canvas");
          const scale = s.printer_max_width_px / c.width;
          scaled.width = s.printer_max_width_px;
          scaled.height = Math.round(c.height * scale);
          const scx = scaled.getContext("2d");
          scx.imageSmoothingEnabled = false;
          scx.drawImage(c, 0, 0, scaled.width, scaled.height);
          out = scaled;
        }

        temp.push({
          canvas: out,
          name: `hstrip_tmp_${String(i + 1).padStart(2, "0")}.png`,
        });
      }

      const reversed = temp.reverse();

      strips = reversed.map((st, idx) => ({
        canvas: st.canvas,
        name: `hstrip_${String(idx + 1).padStart(2, "0")}.png`,
      }));
    } else {
      const w = sourceCanvas.width,
        h = sourceCanvas.height;
      const step = s.printer_max_width_px;
      const count = Math.ceil(w / step);
      for (let i = 0; i < count; i++) {
        const x0 = i * step;
        const sw = Math.min(step, w - x0);

        const c = document.createElement("canvas");
        c.width = step;
        c.height = h;
        const g = c.getContext("2d");
        g.fillStyle = "#fff";
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(sourceCanvas, x0, 0, sw, h, 0, 0, sw, h);

        strips.push({
          canvas: c,
          name: `diagstrip_${String(i + 1).padStart(2, "0")}.png`,
        });
      }
    }

    busy = false;
    setStatus(`Generated ${strips.length} strips.`);
  }

  async function downloadFull() {
    try {
      if (!fullCanvas) {
        setStatus("No full image. Generate strips first.");
        return;
      }
      const blob = await blobFromCanvas(fullCanvas);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: "tessellate_full.png",
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("Full image downloaded.");
    } catch (e) {
      console.error(e);
      setStatus("Full image download failed.");
      alert("Full image download failed: " + (e?.message || e));
    }
  }

  async function downloadZIP() {
    try {
      if (!strips.length) {
        setStatus("Nothing to download. Generate strips first.");
        return;
      }
      const zip = new JSZip();
      const folder = zip.folder("tessellated_strips") || zip;
      for (const st of strips) {
        const blob = await blobFromCanvas(st.canvas);
        folder.file(st.name, blob);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tessellated_strips.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("ZIP downloaded.");
    } catch (e) {
      console.error(e);
      setStatus("Download failed.");
      alert("Download failed: " + (e?.message || e));
    }
  }

  async function doWebUSBPrint() {
    try {
      if (!strips.length) {
        setStatus("Nothing to print. Generate strips first.");
        return;
      }
      const ids = strips.map((st) =>
        st.canvas
          .getContext("2d")
          .getImageData(0, 0, st.canvas.width, st.canvas.height)
      );
      setStatus("Opening printer…");
      await printStripsWebUSB(ids, {
        pause: printer.pause,
        cut: printer.cut,
        vendorIdHex: printer.vendorIdHex,
        productIdHex: printer.productIdHex,
        iface: Number(printer.iface) || 0,
        endpoint: Number(printer.endpoint) || 1,
        align: printer.align,
      });
      setStatus("Print job sent.");
    } catch (e) {
      console.error(e);
      setStatus("Print failed.");
      alert(
        "Print failed: " +
          (e?.message ||
            e ||
            "Check WebUSB support and your Vendor/Product IDs, interface, endpoint.")
      );
    }
  }

  function onAutoChange() {
    if (imgEl && !busy) generateStrips();
  }
</script>

<div class="grid">
  <div class="panel controls">
    <h1>tessellate</h1>
    <p class="desc">
      tessellate splits images into printable strips for thermal receipt
      printers, supporting all DIN formats (A0–A6) and custom banner sizes. It’s
      ideal for large-format or experimental printing with standard receipt
      printers, roll printers, and thermal printers.
    </p>

    <input
      type="file"
      bind:this={fileInput}
      accept="image/*"
      on:change={onFileChange}
    />

    <div class="row">
      <div>
        <label>DIN</label>
        <select bind:value={s.din} on:change={onAutoChange}>
          {#each DIN_KEYS as k}
            <option value={k}>{k}</option>
          {/each}
        </select>
      </div>
      <div>
        <label>Custom Width (cm)</label>
        <input
          type="number"
          step="0.1"
          bind:value={s.width_cm}
          on:change={onAutoChange}
        />
      </div>
      <div>
        <label>Custom Height (cm)</label>
        <input
          type="number"
          step="0.1"
          bind:value={s.height_cm}
          on:change={onAutoChange}
        />
      </div>
    </div>

    <div class="row">
      <div>
        <label>Mode</label>
        <select bind:value={s.mode} on:change={onAutoChange}>
          <option value="fit">fit</option>
          <option value="fill">fill</option>
          <option value="stretch">stretch</option>
        </select>
      </div>
      <div>
        <label>Direction</label>
        <select bind:value={s.direction} on:change={onAutoChange}>
          <option value="vertical">vertical</option>
          <option value="horizontal">horizontal</option>
          <option value="diagonal">diagonal</option>
        </select>
      </div>
      <div>
        <label>Pixel size (px)</label>
        <input
          type="number"
          step="1"
          min="1"
          bind:value={s.pixel_size_px}
          on:change={onAutoChange}
        />
      </div>
    </div>
    <div class="row">
      <div>
        <label>Dither</label>
        <select bind:value={s.dither} on:change={onAutoChange}>
          <option value="floyd">floyd</option>
          <option value="halftone">halftone</option>
          <option value="none">none</option>
        </select>
      </div>
      <div>
        <label> Invert</label>
        <input
          type="checkbox"
          bind:checked={s.invert}
          on:change={onAutoChange}
        />
      </div>

      <div>
        <label>Halftone cell</label>
        <input
          type="number"
          step="1"
          bind:value={s.halftone_cell}
          on:change={onAutoChange}
        />
      </div>
    </div>

    <div class="row" style="margin-top: 10px;">
      <button on:click={downloadFull}>Download Image</button>
      <button on:click={downloadZIP}>Download Strips</button>
      <button on:click={doWebUSBPrint}>Print</button>
    </div>

    <p class="muted">{busy ? "Working…" : statusMsg}</p>

    <div class="printer-box">
      <h3>Printer</h3>
      <div class="row">
        <div>
          <label>Vendor ID (hex)</label>
          <input placeholder="e.g. 04b8" bind:value={printer.vendorIdHex} />
        </div>
        <div>
          <label>Product ID (hex)</label>
          <input placeholder="optional" bind:value={printer.productIdHex} />
        </div>

        <div>
          <label>Interface</label>
          <input type="number" min="0" bind:value={printer.iface} />
        </div>
      </div>
      <div class="row">
        <div>
          <label>Endpoint</label>
          <input type="number" min="1" bind:value={printer.endpoint} />
        </div>

        <div>
          <label>Dots/mm</label>
          <input
            type="number"
            step="1"
            min="1"
            bind:value={s.printer_dots_per_mm}
            on:change={onAutoChange}
          />
        </div>
        <div>
          <label>Strip (mm)</label>
          <input
            type="number"
            step="0.1"
            min="1"
            bind:value={s.strip_mm}
            on:change={onAutoChange}
          />
        </div>
      </div>
      <div class="row">
        <div>
          <label>Printer max width (px)</label>
          <input
            type="number"
            step="1"
            bind:value={s.printer_max_width_px}
            on:change={onAutoChange}
          />
        </div>
      </div>
      <div class="row">
        <div>
          <label>Align</label>
          <select bind:value={printer.align}>
            <option value="left">left</option>
            <option value="center">center</option>
            <option value="right">right</option>
          </select>
        </div>

        <div>
          <label> Pause</label>
          <input type="checkbox" bind:checked={printer.pause} />
        </div>
        <div>
          <label> Cut</label>
          <input type="checkbox" bind:checked={printer.cut} />
        </div>
      </div>
    </div>
  </div>

  <div class="panel">
    {#if strips.length}
      <!-- <h3>Strips</h3> -->
      <div class="strips">
        {#each strips as st}
          <div class="stripItem">
            <img src={st.canvas.toDataURL()} alt={st.name} />
            <div class="muted">
              {st.name} — {st.canvas.width}×{st.canvas.height}px
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted">Loading default image… or choose a file.</p>
    {/if}
  </div>
</div>

<style>
  :root {
    --bg: #e2e2e2;
    --panel: #d6d6d6;
    --muted: #7a7a7a;
    --fg: #252525;
    --accent: red;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    font-size: 10px;
    font-family: "Courier New", Courier, monospace;
  }

  :global(::selection) {
    color: var(--accent);
  }

  h1,
  h2,
  h3,
  h4 {
    font-weight: 100;
    color: var(--accent);
  }

  .grid {
    background: var(--bg);
    color: var(--fg);
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 8px;
    padding: 8px;
  }

  .panel {
    background: var(--panel);
    border-radius: 6px;
    padding: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
  }

  /* Force 3 columns per row */
  .row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    align-items: center;
    padding-top: 10px;
  }

  .controls label {
    display: block;
    font-size: 10px;
    color: var(--muted);
    margin: 0 0 2px 0;
  }

  input,
  select,
  button {
    border: 1px solid #bbb;
    background: #f5f5f5;
    color: var(--fg);
    border-radius: 6px;
    padding: 2px 3px;
    width: 100%;
    box-sizing: border-box;
    cursor: pointer;
  }

  input[type="checkbox"] {
    width: fit-content;
  }

  .strips {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 8px;
  }

  .stripItem {
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 4px;
    height: fit-content;
  }

  .stripItem img {
    width: 100%;
    height: auto;
    image-rendering: pixelated;
  }

  .muted {
    color: var(--accent);
    font-size: 10px;
  }

  .printer-box {
    margin-top: 12px;
    border: 1px solid #c9c9c9;
    background: #efefef;
    padding: 8px;
    border-radius: 6px;
  }

  @media (max-width: 980px) {
    .grid {
      grid-template-columns: 1fr;
    }
    .row {
      grid-template-columns: 1fr; /* collapse to 1 col on small screens */
    }
  }
</style>
