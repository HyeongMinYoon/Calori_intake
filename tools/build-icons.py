#!/usr/bin/env python3
"""Render the app icon to PNGs with headless Chromium.

The mark is the one the design used for its apple-touch-icon: dark slate
ground, "kcal" in mono, and the three macro bars in the carb / protein / fat
channel colours. The design inlined it as an SVG data URI, which iOS ignores
for home-screen icons, so it is rasterised to PNG here instead.

Chromium's headless viewport comes up shorter than the requested window, so
each icon is rendered on an oversized canvas and cropped back to a square.
PNG encoding is done with the standard library — no Pillow dependency.

Run:  python3 tools/build-icons.py [--chrome /path/to/chrome]
"""
import argparse
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "icons")

CHROME_CANDIDATES = [
    "/opt/pw-browsers/chromium",
    "google-chrome",
    "chromium",
    "chromium-browser",
]

TEMPLATE = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;padding:0;background:#131C25}} svg{{display:block}}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="{size}" height="{size}">
  <rect width="180" height="180" fill="#131C25"/>
  <g transform="{inner}">
    <rect x="24" y="96" width="132" height="14" fill="#D98E2B"/>
    <rect x="24" y="118" width="90" height="14" fill="#1F7A68"/>
    <rect x="24" y="140" width="48" height="14" fill="#A8455C"/>
    <text x="24" y="68" font-family="'DejaVu Sans Mono','Liberation Mono',monospace"
          font-size="44" font-weight="700" fill="#EAEEF2">kcal</text>
  </g>
</svg></body></html>"""


def find_chrome(explicit=None):
    for cand in ([explicit] if explicit else []) + CHROME_CANDIDATES:
        path = cand if os.path.exists(cand) else shutil.which(cand)
        if path:
            return path
    sys.exit("chrome/chromium not found — pass --chrome /path/to/binary")


def read_png(path):
    """Decode an 8-bit RGB/RGBA PNG into a list of unfiltered scanlines."""
    data = open(path, "rb").read()
    pos, idat, w, h, color_type = 8, b"", None, None, None
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if tag == b"IHDR":
            w, h, depth, color_type = struct.unpack(">IIBB", chunk[:10])
            if depth != 8:
                raise ValueError(f"unsupported bit depth {depth}")
        elif tag == b"IDAT":
            idat += chunk
        pos += 12 + length

    channels = {0: 1, 2: 3, 4: 2, 6: 4}[color_type]
    stride = w * channels
    raw = zlib.decompress(idat)
    rows, prev, i = [], bytearray(stride), 0
    for _ in range(h):
        filt = raw[i]
        i += 1
        line = bytearray(raw[i:i + stride])
        i += stride
        if filt:
            for x in range(stride):
                a = line[x - channels] if x >= channels else 0
                b = prev[x]
                c = prev[x - channels] if x >= channels else 0
                if filt == 1:
                    line[x] = (line[x] + a) & 255
                elif filt == 2:
                    line[x] = (line[x] + b) & 255
                elif filt == 3:
                    line[x] = (line[x] + (a + b) // 2) & 255
                else:  # Paeth
                    p = a + b - c
                    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                    line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(bytes(line))
        prev = line
    return w, h, channels, rows


def write_png(path, size, channels, rows):
    raw = b"".join(b"\x00" + r for r in rows)
    color_type = {3: 2, 4: 6}[channels]

    def chunk(tag, payload):
        body = tag + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, color_type, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    open(path, "wb").write(png)


def render(chrome, workdir, size, inner, name):
    page = os.path.join(workdir, "icon.html")
    shot = os.path.join(workdir, "shot.png")
    open(page, "w").write(TEMPLATE.format(size=size, inner=inner))
    subprocess.run(
        [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
         "--force-device-scale-factor=1", f"--window-size={size},{size + 200}",
         f"--screenshot={shot}", f"file://{page}"],
        capture_output=True, check=True,
    )
    w, h, channels, rows = read_png(shot)
    if w < size or h < size:
        raise SystemExit(f"{name}: chromium rendered {w}x{h}, need at least {size}x{size}")
    cropped = [r[:size * channels] for r in rows[:size]]
    # The ground colour runs to every edge, so a light bottom row means the
    # crop landed on empty canvas rather than the icon.
    if cropped[-1][0] >= 60:
        raise SystemExit(f"{name}: bottom row is not the icon ground — crop is off")
    write_png(os.path.join(OUT, name), size, channels, cropped)
    print(f"{name}: {size}x{size}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome", help="path to a chrome/chromium binary")
    args = ap.parse_args()

    chrome = find_chrome(args.chrome)
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as workdir:
        # Full-bleed art for the "any" purpose and the iOS home-screen icon.
        render(chrome, workdir, 180, "translate(0,0)", "icon-180.png")
        render(chrome, workdir, 192, "translate(0,0)", "icon-192.png")
        render(chrome, workdir, 512, "translate(0,0)", "icon-512.png")
        # Maskable icons get clipped to a device-chosen shape, so the art is
        # scaled into the safe zone (centre 80%) with ground colour around it.
        render(chrome, workdir, 512, "translate(34.2,34.2) scale(0.62)", "icon-maskable-512.png")


if __name__ == "__main__":
    main()
