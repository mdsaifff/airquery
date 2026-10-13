"""arXiv ML papers -> 3D "galaxy": papers.parquet + papers.schema.json.

Downloads cs.LG / cs.CL / cs.CV metadata from the public arXiv API (per quarter,
2019-2025), embeds title + abstract on CPU (sentence-transformers), lays them out
in 3D with UMAP. Only ids, titles, years and fields are written out: abstracts
are used for the embedding and stay in data_prep/raw/ (not republished).

Usage: uv run --group galaxy python papers.py [--per-quarter 200] [--force]
"""

import argparse
import math
import re
import time
import xml.etree.ElementTree as ET
from collections.abc import Callable, Sequence
from pathlib import Path

import duckdb
import requests

from quakes import OUT_DIR, RAW_DIR, USER_AGENT

ARXIV_URL = "https://export.arxiv.org/api/query"
CATEGORIES = ("cs.LG", "cs.CL", "cs.CV")
FIELD_NAMES = {"cs.LG": "machine learning", "cs.CL": "language", "cs.CV": "vision"}
YEARS = range(2019, 2026)
SLEEP_S = 3.0  # arXiv asks for one request every 3 seconds
NS = {"a": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}

Embed = Callable[[list[str]], Sequence[Sequence[float]]]
Reduce = Callable[[Sequence[Sequence[float]]], Sequence[Sequence[float]]]


def quarter_ranges(year: int) -> list[tuple[str, str]]:
    ends = {3: 31, 6: 30, 9: 30, 12: 31}
    return [(f"{year}{m - 2:02d}010000", f"{year}{m:02d}{ends[m]}2359") for m in (3, 6, 9, 12)]


def download(per_quarter: int, force: bool = False) -> list[Path]:
    raw = RAW_DIR / "arxiv"
    raw.mkdir(parents=True, exist_ok=True)
    paths = []
    for cat in CATEGORIES:
        for year in YEARS:
            for q, (start, end) in enumerate(quarter_ranges(year), 1):
                path = raw / f"{cat}_{year}Q{q}_{per_quarter}.xml"
                paths.append(path)
                if path.exists() and not force:
                    continue
                params = {
                    "search_query": f"cat:{cat} AND submittedDate:[{start} TO {end}]",
                    "start": 0,
                    "max_results": per_quarter,
                }
                headers = {"User-Agent": USER_AGENT}
                resp = requests.get(ARXIV_URL, params=params, headers=headers, timeout=120)
                resp.raise_for_status()
                path.write_text(resp.text, encoding="utf-8")
                print(f"downloaded {path.name}: {resp.text.count('<entry>')} entries")
                time.sleep(SLEEP_S)
    return paths


def field_of(primary: str, categories: list[str]) -> str:
    if primary in CATEGORIES:
        return FIELD_NAMES[primary]
    for cat in CATEGORIES:
        if cat in categories:
            return FIELD_NAMES[cat]
    return FIELD_NAMES["cs.LG"]


def parse(xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)
    records = []
    for e in root.findall("a:entry", NS):
        raw_id = e.findtext("a:id", "", NS)
        m = re.search(r"abs/([^v]+)(v\d+)?$", raw_id)
        primary_el = e.find("arxiv:primary_category", NS)
        if not m or primary_el is None:
            continue
        categories = [c.get("term", "") for c in e.findall("a:category", NS)]
        records.append(
            {
                "id": m.group(1),
                "title": " ".join(e.findtext("a:title", "", NS).split()),
                "year": int(e.findtext("a:published", "0000", NS)[:4]),
                "field": field_of(primary_el.get("term", ""), categories),
                "abstract": " ".join(e.findtext("a:summary", "", NS).split()),
            }
        )
    return records


def normalize(coords: Sequence[Sequence[float]]) -> list[tuple[float, float, float]]:
    """Centre on the mean; scale so the 98th-percentile point sits at radius 1."""
    n = len(coords)
    mean = [sum(c[i] for c in coords) / n for i in range(3)]
    centred = [tuple(c[i] - mean[i] for i in range(3)) for c in coords]
    radii = sorted(math.sqrt(x * x + y * y + z * z) for x, y, z in centred)
    scale = radii[min(n - 1, int(0.98 * n))] or 1.0
    return [(x / scale, y / scale, z / scale) for x, y, z in centred]


def build(records: list[dict], embed: Embed, reduce: Reduce, out_dir: Path) -> dict:
    """Dedupe, embed, lay out in 3D and write <out_dir>/papers.parquet + schema."""
    seen: set[str] = set()
    papers = [r for r in records if not (r["id"] in seen or seen.add(r["id"]))]
    vectors = embed([f"{p['title']}. {p['abstract']}" for p in papers])
    xyz = normalize(reduce(vectors))

    out_dir.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE papers (id VARCHAR, title VARCHAR, year INTEGER, field VARCHAR, "
        "x DOUBLE, y DOUBLE, z DOUBLE)"
    )
    con.executemany(
        "INSERT INTO papers VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            (p["id"], p["title"], p["year"], p["field"], *c)
            for p, c in zip(papers, xyz, strict=True)
        ],
    )
    parquet = (out_dir / "papers.parquet").as_posix()
    con.execute(f"COPY (SELECT * FROM papers ORDER BY id) TO '{parquet}' (FORMAT parquet)")

    lo, hi = con.execute("SELECT min(year), max(year) FROM papers").fetchone()
    fields = [r[0] for r in con.execute(
        "SELECT field FROM papers GROUP BY field ORDER BY count(*) DESC"
    ).fetchall()]  # fmt: skip
    schema = {
        "dataset": "papers",
        "table": "papers",
        "description": f"Machine-learning papers on arXiv (cs.LG, cs.CL, cs.CV), {lo}-{hi}, "
        "placed by topic: similar abstracts sit close together",
        "id": "id",
        "position": {"kind": "xyz", "x": "x", "y": "y", "z": "z"},
        "columns": [
            {"name": "title", "type": "text", "synonyms": ["about", "on", "titled", "topic"]},
            {
                "name": "year",
                "type": "number",
                "min": lo,
                "max": hi,
                "synonyms": ["since", "published", "when"],
            },  # fmt: skip
            {
                "name": "field",
                "type": "text",
                "categorical": True,
                "examples": fields,
                "synonyms": ["category", "area", "subfield"],
            },  # fmt: skip
        ],
        "default_color_by": "field",
        "row_count": len(papers),
    }
    import json  # noqa: PLC0415

    (out_dir / "papers.schema.json").write_text(json.dumps(schema, indent=2) + "\n", newline="\n")
    return schema


def embed_minilm(texts: list[str]) -> Sequence[Sequence[float]]:
    from sentence_transformers import SentenceTransformer  # noqa: PLC0415

    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", device="cpu")
    return model.encode(texts, batch_size=64, show_progress_bar=True, normalize_embeddings=True)


def reduce_umap(vectors: Sequence[Sequence[float]]) -> Sequence[Sequence[float]]:
    import umap  # noqa: PLC0415

    return umap.UMAP(n_components=3, n_neighbors=15, min_dist=0.1, metric="cosine",
                     random_state=42).fit_transform(vectors)  # fmt: skip


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--per-quarter", type=int, default=200, help="papers per category per quarter")
    ap.add_argument("--force", action="store_true", help="re-download existing files")
    args = ap.parse_args()
    records = [
        r for p in download(args.per_quarter, args.force) for r in parse(p.read_text("utf-8"))
    ]
    schema = build(records, embed_minilm, reduce_umap, Path(OUT_DIR))
    print(f"papers: {schema['row_count']}")


if __name__ == "__main__":
    main()
