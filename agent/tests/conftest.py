import pytest

from spec import DatasetSchema

QUAKES = {
    "dataset": "quakes",
    "table": "quakes",
    "description": "test quakes",
    "position": {"kind": "geo", "lat": "lat", "lon": "lon", "depth": "depth_km"},
    "columns": [
        {
            "name": "time",
            "type": "timestamp",
            "min": "2024-01-01T00:00:00",
            "max": "2024-12-31T23:00:00",
        },
        {"name": "lat", "type": "number", "min": -65.0, "max": 86.0},
        {"name": "lon", "type": "number", "min": -180.0, "max": 180.0},
        {"name": "depth_km", "type": "number", "unit": "km", "min": 1.0, "max": 654.0},
        {"name": "magnitude", "type": "number", "min": 4.5, "max": 7.5},
        {"name": "mag_type", "type": "text", "examples": ["mb", "mww"]},
        {"name": "place", "type": "text", "examples": ["Japan", "Chile"]},
    ],
    "default_color_by": "depth_km",
}


@pytest.fixture
def quakes_schema() -> DatasetSchema:
    """A small stand-in for web/public/data/quakes.schema.json."""
    return DatasetSchema.model_validate(QUAKES)
