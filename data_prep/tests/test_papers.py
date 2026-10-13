import json
from pathlib import Path

import duckdb

from papers import build, normalize, parse, quarter_ranges

FIXTURE = Path(__file__).parent / "fixtures" / "arxiv_sample.xml"


def test_quarter_ranges() -> None:
    assert quarter_ranges(2024)[0] == ("202401010000", "202403312359")
    assert quarter_ranges(2024)[3] == ("202410010000", "202412312359")


def test_parse_atom_feed() -> None:
    records = parse(FIXTURE.read_text())
    assert [r["id"] for r in records] == ["2312.11138", "2312.10185", "1905.00001", "2312.10185"]
    first = records[0]
    assert first["title"] == "Rapid Open-World Adaptation by Adaptation Principles Learning"
    assert first["year"] == 2023
    assert first["field"] == "machine learning"  # primary cs.AI, cross-listed in cs.LG
    assert [r["field"] for r in records[1:3]] == ["language", "vision"]


def test_normalize_centres_and_scales() -> None:
    pts = normalize([(10, 0, 0), (12, 0, 0), (11, 2, 0), (11, -2, 0)])
    assert abs(sum(p[0] for p in pts)) < 1e-9
    assert max(abs(c) for p in pts for c in p) <= 1.0 + 1e-9


def test_build_writes_titles_not_abstracts(tmp_path: Path) -> None:
    def fake_embed(texts: list[str]) -> list[list[float]]:
        return [[float(len(t)), float(i), 1.0, 0.5] for i, t in enumerate(texts)]

    def fake_reduce(vectors: list[list[float]]) -> list[list[float]]:
        return [v[:3] for v in vectors]

    schema = build(parse(FIXTURE.read_text()), fake_embed, fake_reduce, tmp_path)
    assert schema["row_count"] == 3  # duplicate id dropped
    rows = duckdb.sql(f"SELECT * FROM '{(tmp_path / 'papers.parquet').as_posix()}'")
    assert rows.columns == ["id", "title", "year", "field", "x", "y", "z"]
    everything = json.dumps(rows.fetchall()) + json.dumps(schema)
    assert "Novelty adaptation" not in everything  # abstracts are not republished
    written = json.loads((tmp_path / "papers.schema.json").read_text())
    assert written["position"] == {"kind": "xyz", "x": "x", "y": "y", "z": "z"}
    year = next(c for c in written["columns"] if c["name"] == "year")
    assert (year["min"], year["max"]) == (2019, 2023)
    field = next(c for c in written["columns"] if c["name"] == "field")
    assert field["categorical"] is True
