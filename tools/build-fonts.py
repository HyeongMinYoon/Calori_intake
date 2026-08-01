#!/usr/bin/env python3
"""Vendor the two Google fonts the design uses into assets/fonts.

The design's original stylesheet pulled Archivo and IBM Plex Mono from
fonts.googleapis.com. A remote @import breaks the installed app the moment the
phone is offline, so the latin subsets are downloaded and the @font-face rules
rewritten to point at local files.

Only the `latin` subsets are kept: neither family ships Hangul, so Korean text
falls back to the system font either way, and the other subsets are dead weight
in the service-worker cache. Archivo is a variable font, so all three weights
resolve to the same file and are deduped.

Run from anywhere:  python3 tools/build-fonts.py
"""
import os
import re
import urllib.request

CSS_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=Archivo:wght@500;600;700"
    "&family=IBM+Plex+Mono:wght@400;500;600"
    "&display=swap"
)
# A modern browser UA is required — Google serves ancient TTF formats otherwise.
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "assets", "fonts")

HEADER = (
    "/* Archivo + IBM Plex Mono, latin subset only. Vendored so the installed\n"
    "   app keeps its typography with no network. Regenerate with\n"
    "   tools/build-fonts.py if the design's font stack changes. */\n"
)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as r:
        return r.read()


def main():
    os.makedirs(FONT_DIR, exist_ok=True)
    css = fetch(CSS_URL).decode("utf-8")

    # Every @font-face is preceded by a `/* subset */` comment naming its subset.
    blocks = re.findall(r"/\* (\S+) \*/\s*(@font-face \{.*?\})", css, re.S)
    by_bytes, faces = {}, []

    for subset, block in blocks:
        if subset != "latin":
            continue
        url = re.search(r"url\((https://[^)]+)\)", block).group(1)
        family = re.search(r"font-family: '([^']+)'", block).group(1)
        weight = re.search(r"font-weight: (\d+)", block).group(1)
        data = fetch(url)

        # Variable fonts serve one file for every weight — store it once.
        if data in by_bytes:
            name = by_bytes[data]
        else:
            slug = family.replace(" ", "").lower()
            name = f"{slug}.woff2" if slug == "archivo" else f"{slug}-{weight}.woff2"
            with open(os.path.join(FONT_DIR, name), "wb") as f:
                f.write(data)
            by_bytes[data] = name
            print(f"{name}: {len(data)} bytes")
        faces.append(block.replace(url, f"./{name}"))

    out = os.path.join(FONT_DIR, "fonts.css")
    with open(out, "w") as f:
        f.write(HEADER + "\n".join(faces) + "\n")
    print(f"wrote {out} ({len(faces)} faces, {len(by_bytes)} files)")


if __name__ == "__main__":
    main()
