"""Download NASA Earth imagery and write the globe textures into web/public/textures/.

Sources (NASA Visible Earth, public domain):
  day     Blue Marble Next Generation, December 2004, topography + bathymetry
  night   Black Marble 2016 city lights, 0.1 degree
  clouds  Blue Marble cloud composite

Usage: uv run python textures.py [--force]
"""

import argparse
import time
from pathlib import Path

import requests
from PIL import Image, ImageChops, ImageFilter

HERE = Path(__file__).parent
RAW_DIR = HERE / "raw" / "textures"
OUT_DIR = HERE / "../web/public/textures"
USER_AGENT = "AirQuery data_prep (portfolio project)"
NASA = "https://eoimages.gsfc.nasa.gov/images/imagerecords"
SOURCES = {
    "day": f"{NASA}/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg",
    "night": f"{NASA}/144000/144898/BlackMarble_2016_01deg.jpg",
    "clouds": f"{NASA}/57000/57747/cloud_combined_2048.jpg",
}
# file -> ((width, height), source)
OUTPUTS: dict[str, tuple[tuple[int, int], str]] = {
    "earth_day.jpg": ((2048, 1024), "day"),
    "earth_day_1k.jpg": ((1024, 512), "day"),
    "earth_night.jpg": ((2048, 1024), "night"),
    "earth_night_1k.jpg": ((1024, 512), "night"),
    "earth_clouds.jpg": ((2048, 1024), "clouds"),
    "earth_water.png": ((1024, 512), "water"),
}
WATER_MARGIN = 12  # blue must beat red and green by this much (0-255)


def download(name: str, url: str, force: bool) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / url.rsplit("/", 1)[1]
    if path.exists() and not force:
        return path
    print(f"downloading {name}: {url}")
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=120)
    resp.raise_for_status()
    path.write_bytes(resp.content)
    time.sleep(1.0)  # be polite
    return path


def water_mask(day: Image.Image) -> Image.Image:
    """White where the pixel is clearly blue (ocean), black elsewhere."""
    r, g, b = day.convert("RGB").split()
    margin = ImageChops.subtract(b, ImageChops.lighter(r, g))
    return margin.point(lambda v: 255 if v > WATER_MARGIN else 0)


def build(raw: dict[str, Path], out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    day = Image.open(raw["day"]).convert("RGB")
    sources = {
        "day": day,
        "night": Image.open(raw["night"]).convert("RGB"),
        "clouds": Image.open(raw["clouds"]).convert("L"),
        "water": water_mask(day).filter(ImageFilter.GaussianBlur(1)),
    }
    written = []
    for fname, (size, src) in OUTPUTS.items():
        img = sources[src].resize(size, Image.Resampling.LANCZOS)
        path = out_dir / fname
        if fname.endswith(".png"):
            img.save(path, optimize=True)
        else:
            img.save(path, quality=85, optimize=True, progressive=True)
        written.append(path)
    return written


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="download again")
    args = ap.parse_args()
    raw = {name: download(name, url, args.force) for name, url in SOURCES.items()}
    written = build(raw, OUT_DIR)
    total = sum(p.stat().st_size for p in written)
    for p in written:
        print(f"{p.name:22} {p.stat().st_size / 1024:7.0f} KB")
    print(f"total {total / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
