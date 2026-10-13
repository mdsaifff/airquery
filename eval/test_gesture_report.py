from pathlib import Path

from gesture_report import accuracy, heatmap, merge

HEADER = "expected\\detected,point,pinch,zoom,talk,undo,reset,clutch,none,accuracy\n"


def test_merge_and_heatmap(tmp_path: Path) -> None:
    a = tmp_path / "confusion-a.csv"
    b = tmp_path / "confusion-b.csv"
    a.write_text(HEADER + "pinch,0,18,0,0,0,0,2,0,0.900\nreset,0,0,0,0,0,20,0,0,1.000\n")
    b.write_text(HEADER + "pinch,1,19,0,0,0,0,0,0,0.950\nreset,0,0,0,0,0,19,0,1,0.950\n")
    cols, m = merge([a, b])
    assert cols[:2] == ["point", "pinch"] and "accuracy" not in cols
    assert m["pinch"] == {"point": 1, "pinch": 37, "zoom": 0, "talk": 0, "undo": 0,
                          "reset": 0, "clutch": 2, "none": 0}  # fmt: skip
    assert accuracy(m) == {"pinch": 37 / 40, "reset": 39 / 40}
    svg = heatmap(cols, m)
    assert svg.count("<rect x=") == 2 * len(cols)
    assert "pinch → clutch: 2 (5%)" in svg
