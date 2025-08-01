tesselate
=========

<div style="display: flex; gap: 2%; align-items: flex-start;">
  <img src="https://github.com/user-attachments/assets/db5c71a0-af54-490b-9a03-dd2f9d34edd8" alt="image 1" style="width: 79%; height: 100%; object-fit: cover;" />
  <img src="https://github.com/user-attachments/assets/02e3448a-4454-42b8-b2ad-ff861d2e50a2" alt="image 2" style="width: 19%; height: 100%; object-fit: cover;" />
</div>


Tesselate splits images into printable strips for thermal receipt printers, supporting all DIN formats (A0–A6) and custom banner sizes.
It’s ideal for large-format or experimental printing with standard receipt printers, roll printers, and thermal printers.



Installation
------------

Clone this repo and install dependencies:

 ```code
pip install -r requirements.txt
```

Usage
-----

### 1. Split an image

DIN format, vertical strips (A3, Floyd-Steinberg dither):

```code
python tesselate.py tesselate  img/palm.jpg --din A3 --strip_mm 60 --direction vertical --dither_mode floyd
```

Custom size in centimeters (e.g., 55cm x 80cm, horizontal strips):

```code
python tesselate.py tesselate  img/trees.jpg --width_cm 55 --height_cm 80  --direction horizontal --dither_mode floyd  --mode fill
```

Halftone grid and inverted colours

```code
python tesselate.py tesselate  img/palm.jpg --din A4 --invert --dither_mode halftone
```

Options:

    --output_folder           Name of folder for image strips (default: tesselated_strips)
    --strip_mm                Width or height of each strip, in mm (default: 72.2)
    --dither_mode             floyd, halftone, or none
    --direction               vertical, horizontal or diagonal
    --printer_dots_per_mm     Print resolution (default: 8)
    --halftone_cell_size      Dot size for halftone (default: 8)
    --mode                    How to resize: fit, fill, or stretch
    --din                     Use a DIN size (e.g. A2, A4, etc)
    --width_cm                Custom width in centimeters (overrides DIN)
    --height_cm               Custom height in centimeters (overrides DIN)
    --invert                  Invert the image (black <-> white)
    ...

See all available options:

```code
python tesselate.py tesselate --help
```

### 2. Print all image strips in a folder

Direct to USB receipt printer:

```code
python tesselate.py print tesselated_strips --printer_name _0_0_0_0
```

Or, using your system printer (via lpr):

```code
python tesselate.py print tesselated_strips --printer_name YOUR_PRINTER_NAME
```
