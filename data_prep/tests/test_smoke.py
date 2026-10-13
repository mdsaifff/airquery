import duckdb


def test_duckdb_available() -> None:
    assert duckdb.sql("SELECT 1").fetchone() == (1,)
