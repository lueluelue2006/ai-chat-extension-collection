#!/usr/bin/env python3
"""
Render extension PNG icons from SVG source.

Why this exists:
- Some SVGs render incorrectly with direct ImageMagick rasterization (producing blank/white PNGs).
- We use macOS QuickLook (qlmanage) for reliable SVG rasterization, then remove edge background to transparent.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from collections import deque
from pathlib import Path

try:
    from PIL import Image
except Exception as exc:  # pragma: no cover - dev utility
    raise SystemExit(f"[logo] Pillow is required: {exc}")


def ensure_file(path: Path) -> None:
    if not path.is_file():
        raise SystemExit(f"[logo] Missing file: {path}")


def run_qlmanage(svg_path: Path, output_dir: Path, size: int) -> Path:
    cmd = [
        "qlmanage",
        "-t",
        "-s",
        str(size),
        "-o",
        str(output_dir),
        str(svg_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(
            f"[logo] qlmanage failed ({proc.returncode})\nstdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
        )
    png_path = output_dir / f"{svg_path.name}.png"
    ensure_file(png_path)
    return png_path


def strip_edge_background_to_transparent(image: Image.Image, threshold: int = 245) -> Image.Image:
    rgba = image.convert("RGBA")
    pix = rgba.load()
    w, h = rgba.size
    visited = [[False] * h for _ in range(w)]
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[x][y]:
            continue
        visited[x][y] = True
        r, g, b, a = pix[x, y]
        if r >= threshold and g >= threshold and b >= threshold:
            pix[x, y] = (r, g, b, 0)
            q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    return rgba


def crop_to_visible_bounds(image: Image.Image, pad_ratio: float = 0.06) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.split()[-1]
    bbox = alpha.getbbox()
    if not bbox:
        return rgba

    left, top, right, bottom = bbox
    w, h = rgba.size
    content_w = max(1, right - left)
    content_h = max(1, bottom - top)
    pad = int(max(content_w, content_h) * max(0.0, pad_ratio))

    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(w, right + pad)
    bottom = min(h, bottom + pad)

    return rgba.crop((left, top, right, bottom))


def render_icons(svg_path: Path, icons_dir: Path) -> None:
    ensure_file(svg_path)
    icons_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="aishortcuts-logo-") as tmp:
        tmp_dir = Path(tmp)
        preview_png = run_qlmanage(svg_path, tmp_dir, size=1024)
        base = Image.open(preview_png)
        base = strip_edge_background_to_transparent(base)
        base = crop_to_visible_bounds(base)

        for size in (16, 32, 48, 128):
            dst = icons_dir / f"icon{size}.png"
            icon = base.resize((size, size), Image.Resampling.LANCZOS)
            icon.save(dst, format="PNG")
            print(f"[logo] wrote {dst}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render extension icons from SVG logo.")
    parser.add_argument(
        "--svg",
        default="icons/logo.svg",
        help="Path to source SVG (default: icons/logo.svg)",
    )
    parser.add_argument(
        "--icons-dir",
        default="icons",
        help="Output icons directory (default: icons)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    svg_path = Path(args.svg).resolve()
    icons_dir = Path(args.icons_dir).resolve()

    if sys.platform != "darwin":
        print("[logo] Warning: qlmanage is macOS-only. This script is intended for local macOS asset generation.")
    render_icons(svg_path, icons_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
