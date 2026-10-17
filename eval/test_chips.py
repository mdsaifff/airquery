import json
from pathlib import Path

import duckdb
from compile_sql import compile_spec
from schema_registry import SchemaRegistry
from spec import QuerySpec

DATA = Path(__file__).resolve().parent.parent / "web/public/data"


def test_every_chip_validates_compiles_and_finds_quakes() -> None:
    schema = SchemaRegistry.load(DATA).get("quakes")
    con = duckdb.connect()
    con.execute(f"CREATE TABLE quakes AS SELECT * FROM '{(DATA / 'quakes.parquet').as_posix()}'")
    chips = json.loads((DATA / "quakes.chips.json").read_text(encoding="utf-8"))
    for chip in chips:
        spec = QuerySpec.model_validate({"dataset": "quakes", "mode": "replace", **chip["spec"]})
        q = compile_spec(spec, schema)  # raises InvalidSpecError on a bad chip
        rows = con.execute(q.sql, q.params).fetchall()
        assert rows, chip["label"]
