import pytest

from compile_sql import InvalidSpecError, compile_spec
from spec import DatasetSchema, QuerySpec

SELECT = 'SELECT "id", "lat", "lon", "depth_km" FROM "quakes"'


def spec(**kw: object) -> QuerySpec:
    return QuerySpec.model_validate({"dataset": "quakes", **kw})


def f(field: str, op: str, value: object) -> dict:
    return {"field": field, "op": op, "value": value}


def test_no_filters_selects_id_and_position(quakes_schema: DatasetSchema) -> None:
    q = compile_spec(spec(), quakes_schema)
    assert (q.sql, q.params) == (SELECT, [])


def test_comparison_uses_a_bound_param(quakes_schema: DatasetSchema) -> None:
    q = compile_spec(spec(filters=[f("depth_km", ">", 300)]), quakes_schema)
    assert q.sql == SELECT + ' WHERE "depth_km" > ?'
    assert q.params == [300]


def test_encodings_join_the_select_list_once(quakes_schema: DatasetSchema) -> None:
    q = compile_spec(spec(color_by="magnitude", size_by="depth_km"), quakes_schema)
    assert q.sql == 'SELECT "id", "lat", "lon", "depth_km", "magnitude" FROM "quakes"'


def test_between_and_in(quakes_schema: DatasetSchema) -> None:
    q = compile_spec(
        spec(filters=[f("magnitude", "between", [5, 6.5]), f("mag_type", "in", ["mb", "mww"])]),
        quakes_schema,
    )
    assert q.sql == SELECT + ' WHERE "magnitude" BETWEEN ? AND ? AND "mag_type" IN (?, ?)'
    assert q.params == [5, 6.5, "mb", "mww"]


def test_timestamps_are_cast(quakes_schema: DatasetSchema) -> None:
    q = compile_spec(
        spec(filters=[f("time", "between", ["2024-01-01", "2024-02-01"])]), quakes_schema
    )
    assert q.sql == SELECT + ' WHERE "time" BETWEEN CAST(? AS TIMESTAMP) AND CAST(? AS TIMESTAMP)'
    assert q.params == ["2024-01-01", "2024-02-01"]


def test_contains_is_case_insensitive_and_escapes_wildcards(quakes_schema: DatasetSchema) -> None:
    q = compile_spec(spec(filters=[f("place", "contains", "50%_off\\")]), quakes_schema)
    assert q.sql == SELECT + " WHERE \"place\" ILIKE ? ESCAPE '\\'"
    assert q.params == ["%50\\%\\_off\\\\%"]


def test_last_days_counts_back_from_the_newest_row(quakes_schema: DatasetSchema) -> None:
    q = compile_spec(spec(filters=[f("time", "last_days", 30)]), quakes_schema)
    assert q.sql == SELECT + (
        ' WHERE "time" >= (SELECT max("time") FROM "quakes") - to_days(CAST(? AS INTEGER))'
    )
    assert q.params == [30]


def test_sort_and_limit(quakes_schema: DatasetSchema) -> None:
    q = compile_spec(spec(sort={"field": "magnitude"}, limit=10), quakes_schema)
    assert q.sql == SELECT + ' ORDER BY "magnitude" DESC NULLS LAST LIMIT 10'
    q = compile_spec(spec(sort={"field": "time", "direction": "asc"}), quakes_schema)
    assert q.sql.endswith('ORDER BY "time" ASC NULLS LAST')


@pytest.mark.parametrize(
    "value",
    [
        "Japan'; DROP TABLE quakes; --",
        "' OR '1'='1",
        'x") OR 1=1 --',
        "Robert'); DELETE FROM quakes WHERE ('a'='a",
    ],
)
def test_injection_in_values_stays_a_parameter(quakes_schema: DatasetSchema, value: str) -> None:
    for op in ("=", "contains", "!="):
        q = compile_spec(spec(filters=[f("place", op, value)]), quakes_schema)
        assert value not in q.sql
        assert "DROP" not in q.sql and "DELETE" not in q.sql and "1=1" not in q.sql
        assert q.sql.count("?") == 1
        assert value in str(q.params[0])


@pytest.mark.parametrize(
    "kw",
    [
        {"filters": [f('place" = place OR "1', "=", "x")]},
        {"filters": [f("depth_km; DROP TABLE quakes", ">", 1)]},
        {"filters": [f("1=1 OR depth_km", ">", 1)]},
        {"sort": {"field": "magnitude DESC; DROP TABLE quakes"}},
        {"color_by": "magnitude) FROM quakes; --"},
        {"size_by": "(SELECT 1)"},
    ],
)
def test_injection_in_field_names_is_rejected(quakes_schema: DatasetSchema, kw: dict) -> None:
    with pytest.raises(InvalidSpecError):
        compile_spec(spec(**kw), quakes_schema)


def test_unvalidated_specs_never_compile(quakes_schema: DatasetSchema) -> None:
    with pytest.raises(InvalidSpecError, match="does not fit"):
        compile_spec(spec(filters=[f("place", ">", "Japan")]), quakes_schema)


def test_limit_is_bounded_by_the_model() -> None:
    with pytest.raises(ValueError):
        spec(limit=10_000)
    with pytest.raises(ValueError):
        spec(limit="10; DROP TABLE quakes")


def test_xyz_datasets_select_their_position_columns() -> None:
    schema = DatasetSchema.model_validate(
        {
            "dataset": "papers",
            "table": "papers",
            "description": "t",
            "position": {"kind": "xyz", "x": "x", "y": "y", "z": "z"},
            "columns": [{"name": "year", "type": "number", "min": 2019, "max": 2025}],
        }
    )
    q = compile_spec(
        QuerySpec.model_validate(
            {"dataset": "papers", "filters": [{"field": "year", "op": ">=", "value": 2023}]}
        ),
        schema,
    )
    assert q.sql == 'SELECT "id", "x", "y", "z" FROM "papers" WHERE "year" >= ?'
