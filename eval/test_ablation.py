import json
from pathlib import Path

from ablation import collect, write


def fake_report(d: Path, name: str, model: str, repair: bool, result: float, cost: float) -> None:
    summary = {
        "result_set_match": result,
        "spec_exact_match": result - 0.05,
        "cost_usd_per_100_queries": cost,
        "latency_ms": {"total_p50": 800.0},
        "invalid_sql": 0,
    }
    meta = {"model": model, "repair": repair, "provider": "x", "date": "2026-11-02"}
    (d / f"{name}.json").write_text(json.dumps({"meta": meta, "summary": summary, "rows": []}))


def test_ablation_table_and_chart(tmp_path: Path) -> None:
    fake_report(tmp_path, "2026-11-02_big", "big", True, 0.94, 1.2)
    fake_report(tmp_path, "2026-11-02_big-norepair", "big", False, 0.9, 1.0)
    fake_report(tmp_path, "2026-11-02_small", "small", True, 0.81, 0.05)
    (tmp_path / "2026-11-02_gold-oracle.json").write_text(
        json.dumps({"meta": {"provider": "gold"}, "summary": {}})
    )
    rows = collect(tmp_path, "2026-11-02")
    assert {(r["model"], r["repair"]) for r in rows} == {
        ("big", True),
        ("big", False),
        ("small", True),
    }
    md = write(rows, tmp_path, "2026-11-02")
    text = md.read_text()
    assert "| big | on | 94.0% |" in text
    assert "| small | on | 81.0% | 76.0% | 0.050 |" in text
    svg = (tmp_path / "2026-11-02_ablation.svg").read_text()
    assert svg.count('<circle class="mark') == 3
    assert "USD per 100 queries" in svg
    # never overwrites
    assert write(rows, tmp_path, "2026-11-02").name == "2026-11-02_ablation-2.md"
