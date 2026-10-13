from pathlib import Path

import pytest
from pydantic import ValidationError

from schema_registry import SchemaRegistry, UnknownDatasetError
from settings import settings
from spec import DatasetSchema, QuerySpec
from validate import validate_spec


def spec(**kw: object) -> QuerySpec:
    return QuerySpec.model_validate({"dataset": "quakes", **kw})


def f(field: str, op: str, value: object) -> dict:
    return {"field": field, "op": op, "value": value}


def test_valid_specs_pass(quakes_schema: DatasetSchema) -> None:
    ok = [
        spec(filters=[f("depth_km", ">", 300)]),
        spec(filters=[f("magnitude", "between", [5, 6.5])]),
        spec(filters=[f("place", "contains", "Japan")]),
        spec(filters=[f("mag_type", "in", ["mb", "mww"])]),
        spec(filters=[f("time", ">=", "2024-06-01")]),
        spec(filters=[f("time", "between", ["2024-01-01", "2024-02-01T12:00:00"])]),
        spec(filters=[f("time", "last_days", 30)]),
        spec(color_by="magnitude", size_by="depth_km", sort={"field": "magnitude"}, limit=10),
        spec(color_by="time"),
        spec(intent="navigate", camera_target={"lat": -33, "lon": -70, "label": "Chile"}),
    ]
    for s in ok:
        assert validate_spec(s, quakes_schema) == [], s


@pytest.mark.parametrize(
    "kw, needle",
    [
        ({"filters": [f("depth", ">", 3)]}, "unknown field 'depth'"),
        ({"filters": [f("id; DROP TABLE quakes", "=", 1)]}, "unknown field"),
        ({"color_by": "colour"}, "color_by"),
        ({"color_by": "place"}, "color_by"),  # text can't be a colour ramp
        ({"size_by": "time"}, "size_by"),
        ({"sort": {"field": "nope"}}, "unknown sort field"),
        ({"dataset": "papers"}, "dataset must be 'quakes'"),
    ],
)
def test_unknown_fields_are_rejected(quakes_schema: DatasetSchema, kw: dict, needle: str) -> None:
    assert any(needle in e for e in validate_spec(spec(**kw), quakes_schema))


@pytest.mark.parametrize(
    "flt, needle",
    [
        (f("place", ">", "Japan"), "does not fit text"),
        (f("depth_km", "contains", "3"), "does not fit number"),
        (f("magnitude", "last_days", 3), "does not fit number"),
        (f("time", "contains", "2024"), "does not fit timestamp"),
        (f("depth_km", ">", "deep"), "numeric"),
        (f("place", "=", 5), "text value"),
        (f("place", "contains", "  "), "text value"),
        (f("time", ">", "last tuesday"), "ISO date"),
        (f("time", "last_days", 0), "whole number of days"),
        (f("time", "last_days", 1.5), "whole number of days"),
        (f("depth_km", "between", [100]), "exactly 2"),
        (f("depth_km", "between", [500, 100]), "[low, high]"),
        (f("depth_km", "in", []), "list of 1.."),
        (f("depth_km", ">", [1, 2]), "single value"),
    ],
)
def test_wrong_operator_or_value_type(quakes_schema: DatasetSchema, flt: dict, needle: str) -> None:
    assert any(needle in e for e in validate_spec(spec(filters=[flt]), quakes_schema))


def test_booleans_are_not_coerced_to_numbers() -> None:
    with pytest.raises(ValidationError):
        spec(filters=[f("depth_km", ">", True)])


def test_out_of_range_values(quakes_schema: DatasetSchema) -> None:
    # depth span 653: allowed range is 1 - 326.5 .. 654 + 326.5
    assert validate_spec(spec(filters=[f("depth_km", ">", 950)]), quakes_schema) == []
    for bad in (1000, -400):
        errs = validate_spec(spec(filters=[f("depth_km", ">", bad)]), quakes_schema)
        assert errs and "outside the data range" in errs[0]
    errs = validate_spec(spec(filters=[f("magnitude", "between", [5, 12])]), quakes_schema)
    assert errs and "outside the data range" in errs[0]


def test_navigate_needs_a_target(quakes_schema: DatasetSchema) -> None:
    assert validate_spec(spec(intent="navigate"), quakes_schema) == [
        "intent navigate needs a camera_target with lat, lon and label"
    ]


def test_registry_loads_the_real_schema_files() -> None:
    reg = SchemaRegistry.load(Path(settings.schema_dir))
    assert "quakes" in reg.datasets
    quakes = reg.get("quakes")
    magnitude = quakes.column("magnitude")
    assert magnitude is not None and isinstance(magnitude.min, float)  # computed by data_prep
    with pytest.raises(UnknownDatasetError):
        reg.get("nope")


def test_categorical_text_columns_can_drive_colour(quakes_schema: DatasetSchema) -> None:
    assert validate_spec(spec(color_by="mag_type"), quakes_schema)  # not marked categorical
    cols = [
        c.model_copy(update={"categorical": c.name == "mag_type"}) for c in quakes_schema.columns
    ]
    schema = quakes_schema.model_copy(update={"columns": cols})
    assert validate_spec(spec(color_by="mag_type"), schema) == []
    assert validate_spec(spec(size_by="mag_type"), schema)  # size stays numeric-only
