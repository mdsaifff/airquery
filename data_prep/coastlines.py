"""Natural Earth 110m coastlines (public domain) -> web/public/data/coastlines.json.

Output: {"lines": [[lon, lat, lon, lat, ...], ...]} rounded to 0.01 degrees.
Usage: uv run python coastlines.py [--force]
"""

import argparse
import json
from pathlib import Path

import requests

from quakes import OUT_DIR, RAW_DIR, USER_AGENT

URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_110m_coastline.geojson"
)


def to_lines(geojson: dict) -> list[list[float]]:
    lines = []
    for feature in geojson["features"]:
        geom = feature["geometry"]
        parts = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
        for part in parts:
            lines.append([round(v, 2) for lon, lat in part for v in (lon, lat)])
    return lines


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    raw = RAW_DIR / "ne_110m_coastline.geojson"
    if args.force or not raw.exists():
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        resp = requests.get(URL, headers={"User-Agent": USER_AGENT}, timeout=60)
        resp.raise_for_status()
        raw.write_text(resp.text, encoding="utf-8")
    lines = to_lines(json.loads(raw.read_text(encoding="utf-8")))
    out = Path(OUT_DIR) / "coastlines.json"
    out.write_text(json.dumps({"lines": lines}, separators=(",", ":")), newline="\n")
    print(f"coastlines: {len(lines)} lines, {sum(len(x) for x in lines) // 2} points")


if __name__ == "__main__":
    main()
