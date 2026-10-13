"""Contract drift check, Python side: spec.py must match contracts.schema.json."""

from scripts.export_schema import OUT, render


def test_schema_file_is_up_to_date() -> None:
    assert OUT.read_text(encoding="utf-8") == render(), "run `make contracts`"
