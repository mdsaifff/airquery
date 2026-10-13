"""Download one year of USGS earthquakes and write quakes.parquet + quakes.schema.json.

Usage: uv run python quakes.py [--year 2024] [--min-mag 4.5] [--force]
"""

import argparse
import json
import time
from collections.abc import Sequence
from datetime import date
from pathlib import Path

import duckdb
import requests

HERE = Path(__file__).parent
RAW_DIR = HERE / "raw"
OUT_DIR = HERE / "../web/public/data"
USGS_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"
USER_AGENT = "AirQuery data_prep (portfolio project)"
USGS_CAP = 20_000  # max events per USGS query
SLEEP_S = 1.0  # pause between requests, to be polite

# Hand-written hints for the LLM. min/max/examples below are computed from data.
COLUMNS: list[dict[str, object]] = [
    {"name": "time", "type": "timestamp", "unit": "UTC", "synonyms": ["date", "when", "year"]},
    {"name": "lat", "type": "number", "unit": "degrees", "synonyms": ["latitude"]},
    {"name": "lon", "type": "number", "unit": "degrees", "synonyms": ["longitude"]},
    {
        "name": "depth_km",
        "type": "number",
        "unit": "km",
        "synonyms": ["depth", "deep", "shallow"],
    },
    {
        "name": "magnitude",
        "type": "number",
        "unit": "magnitude",
        "synonyms": ["mag", "strength", "strong", "big", "size"],
    },
    {"name": "mag_type", "type": "text", "categorical": True, "synonyms": ["magnitude type"]},
    {"name": "place", "type": "text", "synonyms": ["region", "location", "near", "country"]},
]

CLEAN_SQL = """
SELECT DISTINCT ON (id)
    id,
    CAST(rtrim(time, 'Z') AS TIMESTAMP) AS time,
    CAST(latitude AS DOUBLE) AS lat,
    CAST(longitude AS DOUBLE) AS lon,
    CAST(depth AS DOUBLE) AS depth_km,
    CAST(mag AS DOUBLE) AS magnitude,
    coalesce(magType, '') AS mag_type,
    coalesce(place, '') AS place
FROM read_csv($paths, header = true, all_varchar = true)
WHERE mag IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL AND depth IS NOT NULL
ORDER BY id
"""


def month_ranges(year: int) -> list[tuple[date, date]]:
    starts = [date(year, m, 1) for m in range(1, 13)] + [date(year + 1, 1, 1)]
    return list(zip(starts[:-1], starts[1:], strict=True))


def download(year: int, min_mag: float, force: bool = False) -> list[Path]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    paths = []
    for start, end in month_ranges(year):
        path = RAW_DIR / f"quakes_{start:%Y_%m}_m{min_mag}.csv"
        paths.append(path)
        if path.exists() and not force:
            continue
        params = {
            "format": "csv",
            "starttime": start.isoformat(),
            "endtime": end.isoformat(),
            "minmagnitude": min_mag,
            "eventtype": "earthquake",
            "orderby": "time-asc",
        }
        resp = requests.get(USGS_URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=60)
        resp.raise_for_status()
        rows = resp.text.count("\n") - 1
        if rows >= USGS_CAP:
            raise RuntimeError(f"{start:%Y-%m} hit the USGS {USGS_CAP} cap; raise --min-mag")
        path.write_text(resp.text, encoding="utf-8")
        print(f"downloaded {start:%Y-%m}: {rows} rows")
        time.sleep(SLEEP_S)
    return paths


def _region(place: str) -> str:
    return place.rsplit(", ", 1)[-1].strip()


def build(csv_paths: Sequence[Path], out_dir: Path, description: str) -> dict[str, object]:
    """Clean CSVs into <out_dir>/quakes.parquet and return the DatasetSchema it wrote."""
    out_dir.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(f"CREATE TABLE quakes AS {CLEAN_SQL}", {"paths": [str(p) for p in csv_paths]})
    parquet = out_dir / "quakes.parquet"
    con.execute(
        f"COPY (SELECT * FROM quakes ORDER BY time) TO '{parquet.as_posix()}' (FORMAT parquet)"
    )

    columns = []
    for col in COLUMNS:
        col = dict(col)
        name = col["name"]
        if col["type"] in ("number", "timestamp"):
            lo, hi = con.execute(f"SELECT min({name}), max({name}) FROM quakes").fetchone()
            if col["type"] == "timestamp":
                lo, hi = lo.isoformat(), hi.isoformat()
            col["min"], col["max"] = lo, hi
        else:
            values = [r[0] for r in con.execute(f"SELECT {name} FROM quakes").fetchall()]
            if name == "place":
                values = [_region(v) for v in values]
            counts: dict[str, int] = {}
            for v in values:
                if v:
                    counts[v] = counts.get(v, 0) + 1
            col["examples"] = sorted(counts, key=lambda k: -counts[k])[:8]
        columns.append(col)

    schema = {
        "dataset": "quakes",
        "table": "quakes",
        "description": description,
        "id": "id",
        "position": {"kind": "geo", "lat": "lat", "lon": "lon", "depth": "depth_km"},
        "columns": columns,
        "default_color_by": "depth_km",
        "default_size_by": "magnitude",
        "row_count": con.execute("SELECT count(*) FROM quakes").fetchone()[0],
    }
    (out_dir / "quakes.schema.json").write_text(json.dumps(schema, indent=2) + "\n", newline="\n")
    return schema


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--year", type=int, default=2024)
    ap.add_argument("--min-mag", type=float, default=4.5)
    ap.add_argument("--force", action="store_true", help="re-download existing months")
    args = ap.parse_args()

    paths = download(args.year, args.min_mag, args.force)
    desc = f"Earthquakes worldwide, M{args.min_mag}+, {args.year}, from the USGS catalog"
    schema = build(paths, OUT_DIR, desc)
    print(f"rows: {schema['row_count']}")
    for col in schema["columns"]:
        if "min" in col:
            print(f"  {col['name']}: {col['min']} .. {col['max']}")


if __name__ == "__main__":
    main()
