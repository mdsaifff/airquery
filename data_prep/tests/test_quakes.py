import json
from datetime import date
from pathlib import Path

import duckdb

from quakes import build, month_ranges

FIXTURE = Path(__file__).parent / "fixtures" / "usgs_sample.csv"


def test_month_ranges_cover_the_year() -> None:
    ranges = month_ranges(2024)
    assert len(ranges) == 12
    assert ranges[0] == (date(2024, 1, 1), date(2024, 2, 1))
    assert ranges[-1] == (date(2024, 12, 1), date(2025, 1, 1))


def test_build_cleans_and_writes_parquet_and_schema(tmp_path: Path) -> None:
    schema = build([FIXTURE], tmp_path, "test")

    rows = duckdb.sql(f"SELECT * FROM '{(tmp_path / 'quakes.parquet').as_posix()}'")
    assert rows.columns == [
        "id",
        "time",
        "lat",
        "lon",
        "depth_km",
        "magnitude",
        "mag_type",
        "place",
    ]
    ids = [r[0] for r in rows.fetchall()]
    # duplicate id collapsed, row without magnitude dropped
    assert sorted(ids) == sorted(
        ["us6000m0w6", "us6000m0wc", "us6000m0wm", "us6000m0xl", "us_noplace"]
    )
    assert schema["row_count"] == 5

    written = json.loads((tmp_path / "quakes.schema.json").read_text())
    assert written == schema
    cols = {c["name"]: c for c in schema["columns"]}
    assert (cols["depth_km"]["min"], cols["depth_km"]["max"]) == (10.0, 513.317)
    assert (cols["magnitude"]["min"], cols["magnitude"]["max"]) == (4.5, 7.5)
    assert cols["time"]["min"] == "2024-01-01T00:37:09.096000"
    assert cols["time"]["max"] == "2024-01-03T12:30:00"
    assert "Japan Earthquake" in cols["place"]["examples"]
    assert cols["mag_type"]["examples"][0] == "mb"
