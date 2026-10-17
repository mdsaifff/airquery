"""More built-in scenes: meteorites, airports, hurricanes, deep-sea corals and stars.

Each one downloads a public file into raw/ (skipped if already there), cleans it with one
DuckDB query, and writes <name>.parquet + <name>.schema.json. min/max/examples are computed
from the data; synonyms and units are hand-written hints for the LLM.

Usage: uv run python catalog.py [meteorites airports hurricanes corals stars] [--force]
"""

import argparse
import json
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import duckdb
import requests

from quakes import OUT_DIR, RAW_DIR, USER_AGENT

MAX_EXAMPLES = 8  # values listed per text column (all of them when categorical)


@dataclass
class Scene:
    name: str
    title: str  # what the scene picker shows
    noun: str  # what the count and the spoken replies call one point, plural
    description: str
    url: str
    clean_sql: str  # SELECT over read_csv($path); must return a text `id` column
    position: dict[str, object]
    columns: list[dict[str, object]]  # hints, in display order
    default_color_by: str | None = None
    default_size_by: str | None = None
    # Run after the table exists, e.g. to scale xyz positions.
    post: Callable[[duckdb.DuckDBPyConnection], None] | None = field(default=None, repr=False)


def download(scene: Scene, force: bool = False) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"{scene.name}.csv"
    if path.exists() and not force:
        return path
    headers = {"User-Agent": USER_AGENT}
    with requests.get(scene.url, headers=headers, timeout=600, stream=True) as resp:
        resp.raise_for_status()
        tmp = path.with_suffix(".part")
        with tmp.open("wb") as f:
            for chunk in resp.iter_content(1 << 20):
                f.write(chunk)
        tmp.replace(path)
    print(f"downloaded {scene.name}: {path.stat().st_size / 1e6:.1f} MB")
    return path


def describe(con: duckdb.DuckDBPyConnection, table: str, hints: list[dict]) -> list[dict]:
    """The schema's columns: hints plus min/max (numbers, times) or examples (text)."""
    columns = []
    for hint in hints:
        col = dict(hint)
        name = f'"{col["name"]}"'
        if col["type"] in ("number", "timestamp"):
            lo, hi = con.execute(f"SELECT min({name}), max({name}) FROM {table}").fetchone()
            if col["type"] == "timestamp":
                lo, hi = lo.isoformat(), hi.isoformat()
            col["min"], col["max"] = lo, hi
        else:
            top = con.execute(
                f"SELECT {name} FROM {table} WHERE {name} <> '' GROUP BY 1 "
                f"ORDER BY count(*) DESC, 1 LIMIT {MAX_EXAMPLES}"
            ).fetchall()
            col["examples"] = [str(r[0])[:80] for r in top]
        columns.append(col)
    return columns


def build(scene: Scene, csv: Path, out_dir: Path) -> dict[str, object]:
    out_dir.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(f"CREATE TABLE {scene.name} AS {scene.clean_sql}", {"path": str(csv)})
    if scene.post:
        scene.post(con)
    parquet = (out_dir / f"{scene.name}.parquet").as_posix()
    con.execute(f"COPY (SELECT * FROM {scene.name} ORDER BY id) TO '{parquet}' (FORMAT parquet)")
    schema = {
        "dataset": scene.name,
        "table": scene.name,
        "title": scene.title,
        "noun": scene.noun,
        "description": scene.description,
        "id": "id",
        "position": scene.position,
        "columns": describe(con, scene.name, scene.columns),
        "default_color_by": scene.default_color_by,
        "default_size_by": scene.default_size_by,
        "row_count": con.execute(f"SELECT count(*) FROM {scene.name}").fetchone()[0],
    }
    path = out_dir / f"{scene.name}.schema.json"
    path.write_text(json.dumps(schema, indent=2) + "\n", newline="\n")
    return schema


# --- the scenes -------------------------------------------------------------------------

METEORITES = Scene(
    name="meteorites",
    title="meteorite landings",
    noun="meteorites",
    description="Known meteorite landings worldwide from The Meteoritical Society, via NASA "
    "(fell = seen falling, found = picked up later)",
    url="https://data.nasa.gov/docs/legacy/meteorite_landings/Meteorite_Landings.csv",
    clean_sql="""
SELECT
    CAST(id AS VARCHAR) AS id,
    name,
    recclass AS class,
    CASE
        WHEN recclass ILIKE 'Iron%' THEN 'iron'
        WHEN recclass ILIKE 'Pallasite%' OR recclass ILIKE 'Mesosiderite%' THEN 'stony-iron'
        WHEN recclass ILIKE 'Lunar%' THEN 'lunar'
        WHEN recclass ILIKE 'Martian%' THEN 'martian'
        WHEN regexp_matches(recclass, '^(LL|L|H)([0-9/~(-]|$)') THEN 'ordinary chondrite'
        WHEN regexp_matches(recclass, '^E(H|L)') THEN 'enstatite chondrite'
        WHEN regexp_matches(recclass, '^C') THEN 'carbonaceous chondrite'
        ELSE 'achondrite or other'
    END AS kind,
    lower(fall) AS fall,
    TRY_CAST("mass (g)" AS DOUBLE) / 1000 AS mass_kg,
    TRY_CAST(year AS INTEGER) AS year,
    CAST(reclat AS DOUBLE) AS lat,
    CAST(reclong AS DOUBLE) AS lon
FROM read_csv($path, header = true, all_varchar = true)
WHERE reclat IS NOT NULL AND reclong IS NOT NULL
    AND NOT (CAST(reclat AS DOUBLE) = 0 AND CAST(reclong AS DOUBLE) = 0)  -- unknown places
    AND CAST(reclong AS DOUBLE) BETWEEN -180 AND 180
    AND nametype = 'Valid' AND TRY_CAST("mass (g)" AS DOUBLE) IS NOT NULL
    AND TRY_CAST(year AS INTEGER) IS NOT NULL
""",
    position={"kind": "geo", "lat": "lat", "lon": "lon"},
    columns=[
        {"name": "name", "type": "text", "synonyms": ["called", "named"]},
        {
            "name": "kind",
            "type": "text",
            "categorical": True,
            "synonyms": [
                "type",
                "group",
                "iron",
                "stony",
                "chondrite",
                "from mars",
                "from the moon",
            ],
        },  # fmt: skip
        {"name": "class", "type": "text", "synonyms": ["classification", "recclass"]},
        {
            "name": "fall",
            "type": "text",
            "categorical": True,
            "synonyms": ["seen falling", "fell", "found", "observed"],
        },  # fmt: skip
        {
            "name": "mass_kg",
            "type": "number",
            "unit": "kg",
            "synonyms": ["mass", "weight", "heavy", "big", "large", "size"],
        },  # fmt: skip
        {
            "name": "year",
            "type": "number",
            "unit": "year",
            "synonyms": ["when", "since", "before", "fell in", "found in"],
        },  # fmt: skip
        {"name": "lat", "type": "number", "unit": "degrees", "synonyms": ["latitude"]},
        {"name": "lon", "type": "number", "unit": "degrees", "synonyms": ["longitude"]},
    ],
    default_color_by="kind",
)

AIRPORTS = Scene(
    name="airports",
    title="airports of the world",
    noun="airports",
    description="Airports, airstrips, heliports and seaplane bases worldwide from OurAirports "
    "(public domain); height above the globe shows elevation",
    url="https://davidmegginson.github.io/ourairports-data/airports.csv",
    clean_sql="""
SELECT
    ident AS id,
    name,
    replace(type, '_', ' ') AS type,
    CAST(latitude_deg AS DOUBLE) AS lat,
    CAST(longitude_deg AS DOUBLE) AS lon,
    coalesce(TRY_CAST(elevation_ft AS DOUBLE), 0) AS elevation_ft,
    coalesce(iso_country, '') AS country,
    coalesce(municipality, '') AS city,
    coalesce(scheduled_service, 'no') AS scheduled_service,
    coalesce(iata_code, '') AS iata
FROM read_csv($path, header = true, all_varchar = true)
WHERE latitude_deg IS NOT NULL AND longitude_deg IS NOT NULL AND type <> 'closed'
    AND name NOT LIKE '[Duplicate]%'
""",
    position={"kind": "geo", "lat": "lat", "lon": "lon", "height": "elevation_ft"},
    columns=[
        {"name": "name", "type": "text", "synonyms": ["called", "named"]},
        {
            "name": "type",
            "type": "text",
            "categorical": True,
            "synonyms": ["kind", "size", "big", "small", "heliport", "seaplane"],
        },  # fmt: skip
        {
            "name": "elevation_ft",
            "type": "number",
            "unit": "feet",
            "synonyms": ["elevation", "altitude", "high", "height"],
        },  # fmt: skip
        {
            "name": "country",
            "type": "text",
            "synonyms": ["ISO country code", "in", "nation"],
        },  # fmt: skip
        {"name": "city", "type": "text", "synonyms": ["town", "municipality", "serving", "near"]},
        {
            "name": "scheduled_service",
            "type": "text",
            "categorical": True,
            "synonyms": ["airline flights", "commercial", "passenger"],
        },  # fmt: skip
        {"name": "iata", "type": "text", "synonyms": ["airport code", "three-letter code"]},
        {"name": "lat", "type": "number", "unit": "degrees", "synonyms": ["latitude"]},
        {"name": "lon", "type": "number", "unit": "degrees", "synonyms": ["longitude"]},
    ],
    default_color_by="type",
)

BASINS = {
    "NA": "North Atlantic",
    "EP": "Eastern Pacific",
    "WP": "Western Pacific",
    "NI": "North Indian",
    "SI": "South Indian",
    "SP": "South Pacific",
    "SA": "South Atlantic",
}
_basin_case = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in BASINS.items())

HURRICANES = Scene(
    name="hurricanes",
    title="hurricane tracks",
    noun="storm positions",
    description="Tropical cyclone tracks (hurricanes, typhoons, cyclones) of the last three "
    "seasons from NOAA IBTrACS, one point per storm every 6 hours",
    url="https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.last3years.list.v04r01.csv",
    clean_sql=f"""
SELECT
    SID || '_' || strftime(t, '%Y%m%d%H') AS id,
    coalesce(nullif(NAME, 'NOT_NAMED'), 'UNNAMED') AS storm,
    CAST(SEASON AS INTEGER) AS season,
    CASE BASIN {_basin_case} ELSE BASIN END AS basin,
    t AS time,
    CAST(LAT AS DOUBLE) AS lat,
    round((CAST(LON AS DOUBLE) + 180) % 360 - 180, 2) AS lon,  -- some tracks run 0..360
    coalesce(TRY_CAST(USA_WIND AS DOUBLE), TRY_CAST(WMO_WIND AS DOUBLE)) AS wind_kt,
    coalesce(TRY_CAST(USA_PRES AS DOUBLE), TRY_CAST(WMO_PRES AS DOUBLE)) AS pressure_mb,
    TRY_CAST(USA_SSHS AS INTEGER) AS category
FROM (
    SELECT *, TRY_CAST(ISO_TIME AS TIMESTAMP) AS t
    FROM read_csv($path, header = true, all_varchar = true)
)
WHERE t IS NOT NULL  -- also drops the units row under the header
    AND TRACK_TYPE = 'main' AND hour(t) % 6 = 0 AND minute(t) = 0
    AND coalesce(TRY_CAST(USA_WIND AS DOUBLE), TRY_CAST(WMO_WIND AS DOUBLE)) IS NOT NULL
""",
    position={"kind": "geo", "lat": "lat", "lon": "lon"},
    columns=[
        {"name": "time", "type": "timestamp", "unit": "UTC", "synonyms": ["date", "when"]},
        {"name": "storm", "type": "text", "synonyms": ["name", "hurricane", "typhoon", "called"]},
        {
            "name": "basin",
            "type": "text",
            "categorical": True,
            "synonyms": ["ocean", "region", "atlantic", "pacific", "indian"],
        },  # fmt: skip
        {
            "name": "wind_kt",
            "type": "number",
            "unit": "knots",
            "synonyms": ["wind", "wind speed", "strong", "strength", "intense"],
        },  # fmt: skip
        {
            "name": "pressure_mb",
            "type": "number",
            "unit": "millibars",
            "synonyms": ["pressure", "central pressure"],
        },  # fmt: skip
        {
            "name": "category",
            "type": "number",
            "unit": "Saffir-Simpson category",
            "synonyms": [
                "cat",
                "category 5",
                "major hurricane is 3 and up",
                "tropical storm is 0",
                "depression is -1",
            ],
        },  # fmt: skip
        {"name": "season", "type": "number", "unit": "year", "synonyms": ["year"]},
        {"name": "lat", "type": "number", "unit": "degrees", "synonyms": ["latitude"]},
        {"name": "lon", "type": "number", "unit": "degrees", "synonyms": ["longitude"]},
    ],
    default_color_by="wind_kt",
    default_size_by="wind_kt",
)

ERDDAP = "https://www.ncei.noaa.gov/erddap/tabledap/deep_sea_corals.csv"
CORAL_FIELDS = (
    "CatalogNumber,latitude,longitude,DepthInMeters,ScientificName,VernacularNameCategory,"
    "ObservationYear,Ocean"
)

CORALS = Scene(
    name="corals",
    title="deep-sea corals",
    noun="coral and sponge records",
    description="Deep-sea coral and sponge observations 1,000 m and deeper, from NOAA's Deep "
    "Sea Coral Research and Technology Program; thinned to one record per kind per ~1 km",
    url=f"{ERDDAP}?{CORAL_FIELDS}&DepthInMeters%3E=1000",
    clean_sql="""
SELECT DISTINCT ON (round(lat, 2), round(lon, 2), kind)
    id, lat, lon, depth_km, kind, species, year, ocean
FROM (
    SELECT
        CatalogNumber AS id,
        TRY_CAST(latitude AS DOUBLE) AS lat,
        TRY_CAST(longitude AS DOUBLE) AS lon,
        TRY_CAST(DepthInMeters AS DOUBLE) / 1000 AS depth_km,
        lower(coalesce(VernacularNameCategory, 'unknown')) AS kind,
        coalesce(ScientificName, '') AS species,
        nullif(TRY_CAST(ObservationYear AS INTEGER), -999) AS year,
        coalesce(Ocean, '') AS ocean
    FROM read_csv($path, header = true, all_varchar = true)
)
WHERE lat IS NOT NULL AND lon IS NOT NULL AND depth_km IS NOT NULL  -- and the units row
ORDER BY round(lat, 2), round(lon, 2), kind, id
""",
    position={"kind": "geo", "lat": "lat", "lon": "lon", "depth": "depth_km"},
    columns=[
        {
            "name": "kind",
            "type": "text",
            "categorical": True,
            "synonyms": ["type", "group", "sponge", "black coral", "stony coral", "soft coral"],
        },  # fmt: skip
        {
            "name": "species",
            "type": "text",
            "synonyms": ["scientific name", "genus", "taxon"],
        },  # fmt: skip
        {
            "name": "depth_km",
            "type": "number",
            "unit": "km",
            "synonyms": ["depth", "deep", "metres down"],
        },  # fmt: skip
        {
            "name": "year",
            "type": "number",
            "unit": "year",
            "synonyms": ["observed", "when", "since"],
        },  # fmt: skip
        {"name": "ocean", "type": "text", "categorical": True, "synonyms": ["sea", "in the"]},
        {"name": "lat", "type": "number", "unit": "degrees", "synonyms": ["latitude"]},
        {"name": "lon", "type": "number", "unit": "degrees", "synonyms": ["longitude"]},
    ],
    default_color_by="depth_km",
)

PC_TO_LY = 3.26156
STARS_MAX_MAG = 7.0  # apparent magnitude: naked eye is about 6


def _scale_stars(con: duckdb.DuckDBPyConnection) -> None:
    """Sun at the origin; the 98th-percentile distance lands at radius 1 (like the galaxy)."""
    (scale,) = con.execute("SELECT quantile_cont(dist_ly, 0.98) FROM stars").fetchone()
    for axis in "xyz":
        con.execute(f"UPDATE stars SET {axis} = {axis} / ?", [scale / PC_TO_LY])


STARS = Scene(
    name="stars",
    title="star map",
    noun="stars",
    description=f"Stars brighter than magnitude {STARS_MAX_MAG} around the Sun (at the "
    "centre), from the HYG database v3 (CC BY-SA 4.0); true 3D positions",
    url="https://raw.githubusercontent.com/codebox/HYG-Database/master/hygdata_v3.csv",
    clean_sql=f"""
SELECT
    id,
    coalesce(nullif(proper, ''), nullif(bayer, '') || ' ' || con, 'HIP ' || hip, 'star ' || id)
        AS name,
    CAST(dist AS DOUBLE) * {PC_TO_LY} AS dist_ly,
    CAST(mag AS DOUBLE) AS mag,
    CAST(absmag AS DOUBLE) AS absmag,
    CASE WHEN upper(left(spect, 1)) IN ('O', 'B', 'A', 'F', 'G', 'K', 'M')
         THEN upper(left(spect, 1)) ELSE 'other' END AS spectral_class,
    coalesce(con, '') AS constellation,
    CAST(x AS DOUBLE) AS x,
    CAST(y AS DOUBLE) AS y,
    CAST(z AS DOUBLE) AS z
FROM read_csv($path, header = true, all_varchar = true)
WHERE CAST(dist AS DOUBLE) < 100000  -- 100000 pc marks a missing parallax
    AND CAST(mag AS DOUBLE) <= {STARS_MAX_MAG}
""",
    position={"kind": "xyz", "x": "x", "y": "y", "z": "z"},
    columns=[
        {"name": "name", "type": "text", "synonyms": ["called", "named", "star"]},
        {
            "name": "spectral_class",
            "type": "text",
            "categorical": True,
            "synonyms": ["colour", "color", "type", "hot", "blue", "red", "sun-like is G"],
        },  # fmt: skip
        {
            "name": "dist_ly",
            "type": "number",
            "unit": "light years",
            "synonyms": ["distance", "far", "near", "close"],
        },  # fmt: skip
        {
            "name": "mag",
            "type": "number",
            "unit": "apparent magnitude, lower is brighter",
            "synonyms": ["brightness", "bright", "visible", "faint"],
        },  # fmt: skip
        {
            "name": "absmag",
            "type": "number",
            "unit": "absolute magnitude, lower is more luminous",
            "synonyms": ["luminosity", "luminous", "true brightness"],
        },  # fmt: skip
        {
            "name": "constellation",
            "type": "text",
            "synonyms": ["in", "constellation abbreviation like Ori or UMa"],
        },  # fmt: skip
    ],
    default_color_by="spectral_class",
    post=_scale_stars,
)

SCENES = {s.name: s for s in (METEORITES, AIRPORTS, HURRICANES, CORALS, STARS)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("names", nargs="*", help=f"any of {', '.join(SCENES)} (default: all)")
    ap.add_argument("--force", action="store_true", help="re-download existing files")
    args = ap.parse_args()
    if unknown := set(args.names) - set(SCENES):
        ap.error(f"unknown scene(s): {', '.join(sorted(unknown))}")
    for name in args.names or SCENES:
        scene = SCENES[name]
        schema = build(scene, download(scene, args.force), Path(OUT_DIR))
        size = (Path(OUT_DIR) / f"{name}.parquet").stat().st_size / 1e6
        print(f"{name}: {schema['row_count']} rows, {size:.1f} MB")


if __name__ == "__main__":
    main()
