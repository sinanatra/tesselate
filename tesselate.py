import argparse
import os
import numpy as np
from PIL import Image, ImageOps
from io import BytesIO
import requests
import subprocess
from escpos.printer import Usb

Image.MAX_IMAGE_PIXELS = None

DIN_SIZES_MM = {
    "A0": (841, 1189),
    "A1": (594, 841),
    "A2": (420, 594),
    "A3": (297, 420),
    "A4": (210, 297),
    "A5": (148, 210),
    "A6": (105, 148),
}

def halftone(img, cell_size=8):
    arr = np.array(img)
    h, w = arr.shape
    result = np.full_like(arr, 255)
    for y in range(0, h, cell_size):
        for x in range(0, w, cell_size):
            block = arr[y:y+cell_size, x:x+cell_size]
            avg = np.mean(block)
            radius = int((1 - avg / 255) * (cell_size/2))
            cy, cx = y + cell_size // 2, x + cell_size // 2
            for i in range(-radius, radius):
                for j in range(-radius, radius):
                    if i**2 + j**2 <= radius**2:
                        if 0 <= cy + i < h and 0 <= cx + j < w:
                            result[cy + i, cx + j] = 0
    return Image.fromarray(result)

def tesselate_image(
    source,
    output_folder,
    width_mm,
    height_mm,
    printer_dots_per_mm=8,
    strip_mm=73,
    mode="fill",
    dither_mode="floyd",
    halftone_cell_size=8,
    invert=False,
    direction="vertical",
):
    target_width_px = int(width_mm * printer_dots_per_mm)
    target_height_px = int(height_mm * printer_dots_per_mm)
    strip_px = int(strip_mm * printer_dots_per_mm)

    os.makedirs(output_folder, exist_ok=True)

    if str(source).startswith("http://") or str(source).startswith("https://"):
        response = requests.get(source)
        img = Image.open(BytesIO(response.content))
    else:
        if not os.path.exists(source):
            raise FileNotFoundError(f"Image not found: {source}")
        img = Image.open(source)

    img = img.convert("L")
    if mode == "fill":
        img = ImageOps.fit(img, (target_width_px, target_height_px), centering=(0.5, 0.5))
    elif mode == "stretch":
        img = img.resize((target_width_px, target_height_px), Image.LANCZOS)
    else:
        img = ImageOps.pad(img, (target_width_px, target_height_px), color=255, centering=(0.5, 0.5))

    if invert:
        img = ImageOps.invert(img)

    if dither_mode == "floyd":
        img = img.convert("1", dither=Image.FLOYDSTEINBERG)
    elif dither_mode == "halftone":
        img = halftone(img, cell_size=halftone_cell_size)
        img = img.convert("1")
    else:
        img = img.convert("1", dither=Image.NONE)

    file_list = []
    if direction == "vertical":
        num_strips = (target_width_px + strip_px - 1) // strip_px
        for idx in range(num_strips):
            x0 = idx * strip_px
            x1 = min((idx + 1) * strip_px, target_width_px)
            strip = img.crop((x0, 0, x1, target_height_px))
            fname = os.path.join(output_folder, f"vstrip_{idx + 1:02d}.png")
            strip.save(fname)
            file_list.append(fname)
    elif direction == "horizontal":
        num_strips = (target_height_px + strip_px - 1) // strip_px
        for idx in range(num_strips):
            y0 = idx * strip_px
            y1 = min((idx + 1) * strip_px, target_height_px)
            strip = img.crop((0, y0, target_width_px, y1))
            strip = strip.rotate(90, expand=True)
            fname = os.path.join(output_folder, f"hstrip_{idx + 1:02d}.png")
            strip.save(fname)
            file_list.append(fname)
    return file_list


def print_strips_from_folder(
    folder,
    printer_name="_0_0_0_0",
    vendor_id=0x04b8,
    product_id=0x0202
):
    files = sorted(
        [os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith((".png", ".jpg", ".jpeg"))]
    )
    if not files:
        print("No images found in the folder.")
        return

    print(f"Found {len(files)} strips. Ready to print.")
    for idx, path in enumerate(files):
        print(f"\n🖨️ Printing strip {idx+1}/{len(files)}: {path}")
        try:
            from escpos.printer import Usb
            from PIL import Image
            img = Image.open(path)
            printer = Usb(vendor_id, product_id)
            printer.image(img)
            printer.cut()
        except Exception as e:
            try:
                subprocess.run(["lpr", "-P", printer_name, path], check=True)
            except subprocess.CalledProcessError as err:
                continue
        if idx < len(files) - 1:
            input("Tear off the strip and press Enter to print the next one...")

def main():
    parser = argparse.ArgumentParser(description="Tesselate images for thermal/art printing.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    tess = subparsers.add_parser("tesselate", help="Tesselate image into strips")
    tess.add_argument("source", help="Source image file (or URL)")
    tess.add_argument("--output_folder", default="tesselated_strips")
    tess.add_argument("--din", choices=DIN_SIZES_MM.keys(), help="DIN size (A4, A3, etc)")
    tess.add_argument("--width_cm", type=float, help="Custom width (cm)")
    tess.add_argument("--height_cm", type=float, help="Custom height (cm)")
    tess.add_argument("--printer_dots_per_mm", type=int, default=8)
    tess.add_argument("--strip_mm", type=float, default=60)
    tess.add_argument("--mode", choices=["fill", "stretch", "fit"], default="fit")
    tess.add_argument("--dither_mode", choices=["floyd", "halftone", "none"], default="floyd")
    tess.add_argument("--halftone_cell_size", type=int, default=8)
    tess.add_argument("--invert", action="store_true", default=False)
    tess.add_argument("--direction", choices=["vertical", "horizontal"], default="vertical")
    p = subparsers.add_parser("print", help="Print all image strips in folder")
    p.add_argument("folder", help="Folder of strips to print")
    p.add_argument("--printer_name", default=None, help="Printer name for lpr")
    p.add_argument("--vendor_id", type=lambda x: int(x,0), default=0x04b8)
    p.add_argument("--product_id", type=lambda x: int(x,0), default=0x0202)
    args = parser.parse_args()
    if args.command == "tesselate":
        if args.width_cm and args.height_cm:
            width_mm, height_mm = args.width_cm * 10, args.height_cm * 10
        elif args.din:
            width_mm, height_mm = DIN_SIZES_MM[args.din]
        else:
            width_mm, height_mm = 210, 297
        tesselate_image(
            args.source,
            output_folder=args.output_folder,
            width_mm=width_mm,
            height_mm=height_mm,
            printer_dots_per_mm=args.printer_dots_per_mm,
            strip_mm=args.strip_mm,
            mode=args.mode,
            dither_mode=args.dither_mode,
            halftone_cell_size=args.halftone_cell_size,
            invert=args.invert,
            direction=args.direction
        )
    elif args.command == "print":
        print_strips_from_folder(
            args.folder,
            printer_name=args.printer_name,
            vendor_id=args.vendor_id,
            product_id=args.product_id
        )

if __name__ == "__main__":
    main()