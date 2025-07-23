tesselate
=========

<img width="952" height="1694" alt="image" src="https://github.com/user-attachments/assets/99d68fd0-48e6-4af8-bd22-6a8f2ef55f03" />

Tesselate splits images into printable strips for thermal receipt printers, supporting all DIN formats (A0–A6) and custom banner sizes.
It’s ideal for large-format or experimental printing with standard receipt printers, roll printers, and thermal printers.

Features
--------

- Tesselate any image into vertical or horizontal strips for long roll/receipt printers
- Supports all DIN paper sizes (A0–A6) and custom cm sizes
- Multiple dithering modes (Floyd-Steinberg, halftone, none)
- Output strips as PNG images, ready for printing
- Direct thermal printer support via USB (with python-escpos), or prints via system lpr

Installation
------------

Clone this repo and install dependencies:

 ```code
pip install -r requirements.txt
```

Usage
-----

## 1. Split an image

DIN format, vertical strips (A3, Floyd-Steinberg dither):

```code
python3 tesselate.py tesselate  img/palm.jpg --din A3 --strip_mm 60 --direction vertical --dither_mode floyd
```

Custom size in centimeters (e.g., 55cm x 80cm, horizontal strips):

```code
python tesselate.py tesselate  img/trees.jpg --width_cm 55 --height_cm 80  --direction horizontal --dither_mode floyd  --mode fill
```

Halftone grid and inverted colours

```code
python3 tesselate.py tesselate  img/palm.jpg --din A4 --invert --dither_mode halftone
```

All options:

    --output_folder           Name of folder for image strips (default: tesselated_strips)
    --strip_mm                Width or height of each strip, in mm (default: 60)
    --dither_mode             floyd, halftone, or none
    --direction               vertical or horizontal
    --printer_dots_per_mm     Print resolution (default: 8)
    --halftone_cell_size      Dot size for halftone (default: 8)
    --mode                    How to resize: fit, fill, or stretch
    --din                     Use a DIN size (e.g. A2, A4, etc)
    --width_cm                Custom width in centimeters (overrides DIN)
    --height_cm               Custom height in centimeters (overrides DIN)
    --invert                  Invert the image (black <-> white)

See all available options:

```code
    python tesselate.py tesselate --help
```

## 2. Print all image strips in a folder

Direct to USB receipt printer:

```code
python tesselate.py print tesselated_strips --printer_name ""
```

Or, using your system printer (via lpr):

    python tesselate.py print tesselated_strips --printer_name YOUR_PRINTER_NAME

