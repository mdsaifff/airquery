from coastlines import to_lines


def test_to_lines_flattens_line_and_multiline_strings() -> None:
    geojson = {
        "features": [
            {"geometry": {"type": "LineString", "coordinates": [[1.234, 2.345], [3.0, 4.0]]}},
            {
                "geometry": {
                    "type": "MultiLineString",
                    "coordinates": [[[5.0, 6.0], [7.0, 8.0]], [[9.0, 10.0], [11.0, 12.0]]],
                }
            },
        ]
    }
    assert to_lines(geojson) == [
        [1.23, 2.35, 3.0, 4.0],
        [5.0, 6.0, 7.0, 8.0],
        [9.0, 10.0, 11.0, 12.0],
    ]
