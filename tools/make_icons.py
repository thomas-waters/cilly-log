"""Generate the app icons (a crescent moon on indigo) as PNGs.

Uses only the standard library so it runs anywhere:  python tools/make_icons.py
"""
import math
import struct
import zlib
from pathlib import Path

INDIGO = (91, 84, 214)
CREAM = (250, 248, 244)
OUT = Path(__file__).resolve().parent.parent / "icons"


def rounded_rect(x, y, size, radius):
    """True when (x, y) lies inside a square with rounded corners."""
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def crescent(x, y, size, scale):
    """True when (x, y) lies inside a crescent moon centred in the square."""
    c = size / 2
    r = size * 0.30 * scale
    inner_r = r * 0.82
    ox, oy = c + r * 0.42, c - r * 0.36
    in_outer = (x - c) ** 2 + (y - c) ** 2 <= r ** 2
    in_inner = (x - ox) ** 2 + (y - oy) ** 2 <= inner_r ** 2
    return in_outer and not in_inner


def render(size, rounded, scale=1.0, supersample=3):
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(supersample):
                for sx in range(supersample):
                    x = px + (sx + 0.5) / supersample
                    y = py + (sy + 0.5) / supersample
                    if rounded and not rounded_rect(x, y, size, size * 0.22):
                        continue
                    color = CREAM if crescent(x, y, size, scale) else INDIGO
                    acc[0] += color[0]; acc[1] += color[1]; acc[2] += color[2]; acc[3] += 255
            n = supersample * supersample
            if acc[3] == 0:
                row += bytes((0, 0, 0, 0))
            else:
                cov = acc[3] / (255 * n)
                row += bytes((round(acc[0] / (n * cov)), round(acc[1] / (n * cov)), round(acc[2] / (n * cov)), round(255 * cov)))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + r for r in rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    OUT.mkdir(exist_ok=True)
    jobs = [
        ("icon-192.png", 192, True, 1.0),
        ("icon-512.png", 512, True, 1.0),
        ("icon-maskable-512.png", 512, False, 0.72),
        ("apple-touch-icon.png", 180, False, 1.0),
        ("favicon-32.png", 32, True, 1.0),
    ]
    for name, size, rounded, scale in jobs:
        write_png(OUT / name, size, render(size, rounded, scale))
        print("wrote", name)


if __name__ == "__main__":
    main()
