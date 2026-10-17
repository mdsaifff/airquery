import asyncio
from collections import Counter

import pytest
from compile_sql import compile_spec
from schema_registry import SchemaRegistry
from spec import QuerySpec
from validate import validate_spec

from score import DATA_DIR, evaluate, gold_oracle, load_items, summarize
from scoring import clarify_scores, haversine_km, normalize, percentile, spec_match

ITEMS = load_items()


def test_the_set_has_the_documented_mix() -> None:
    assert len(ITEMS) == 110
    assert len({i["id"] for i in ITEMS}) == 110
    assert len({(i["utterance"], str(i["prev_spec"])) for i in ITEMS}) == 110
    mix = Counter(i["tags"][0] for i in ITEMS)
    assert mix == {
        "filter": 30, "encoding": 15, "rank": 10, "time": 10,
        "refine": 20, "noisy": 10, "ambiguous": 5,
        "timeline": 4, "view": 3, "pointer": 3,
    }  # fmt: skip


def test_every_gold_and_prev_spec_validates_and_compiles() -> None:
    schema = SchemaRegistry.load(DATA_DIR).get("quakes")
    for item in ITEMS:
        assert item["gold_clarify"] == (item["gold_spec"] is None), item["id"]
        for key in ("gold_spec", "prev_spec"):
            if item[key]:
                spec = QuerySpec.model_validate(item[key])
                assert validate_spec(spec, schema) == [], (item["id"], key)
                compile_spec(spec, schema)


def test_gold_oracle_scores_perfectly() -> None:
    """Harness check: answering with the gold specs must give 100% on every metric."""
    rows = asyncio.run(evaluate(ITEMS, gold_oracle(ITEMS), repair=True))
    s = summarize(rows, 1.0, 1.0)
    misses = [r["id"] for r in rows if not (r["spec_match"] and r["result_match"])]
    assert misses == []
    assert s["spec_exact_match"] == s["result_set_match"] == 1.0
    assert s["clarify"]["precision"] == s["clarify"]["recall"] == 1.0
    assert s["invalid_sql"] == 0


def test_normalize_ignores_order_mode_and_number_types() -> None:
    a = {"dataset": "quakes", "mode": "replace", "filters": [
        {"field": "place", "op": "contains", "value": "Japan"},
        {"field": "depth_km", "op": ">", "value": 300},
    ]}  # fmt: skip
    b = {"dataset": "quakes", "filters": [
        {"field": "depth_km", "op": ">", "value": 300.0},
        {"field": "place", "op": "contains", "value": "japan "},
    ]}  # fmt: skip
    assert normalize(a) == normalize(b)
    assert normalize(b) != normalize({**b, "color_by": "magnitude"})


def test_navigate_uses_a_distance_tolerance() -> None:
    gold = QuerySpec.model_validate(
        {
            "dataset": "quakes",
            "intent": "navigate",
            "camera_target": {"lat": -17.7, "lon": 178.1, "label": "Fiji"},
        }  # fmt: skip
    )
    near = gold.model_copy(update={"camera_target": {"lat": -18.1, "lon": 178.4, "label": "Suva"}})
    far = gold.model_copy(update={"camera_target": {"lat": 35.7, "lon": 139.7, "label": "Tokyo"}})
    assert spec_match(QuerySpec.model_validate(near.model_dump()), gold)
    assert not spec_match(QuerySpec.model_validate(far.model_dump()), gold)
    assert haversine_km(0, 0, 0, 1) == pytest.approx(111.2, abs=0.1)


def test_small_helpers() -> None:
    assert percentile([5, 1, 3], 0.5) == 3
    c = clarify_scores([(True, True), (True, False), (False, True), (False, False)])
    assert (c["precision"], c["recall"]) == (0.5, 0.5)


def test_timeline_and_view_items_are_scored_by_intent() -> None:
    from score import score_item

    items = {i["id"]: i for i in ITEMS}
    schema = SchemaRegistry.load(DATA_DIR).get("quakes")
    seek = items["v03"]
    timeline = {"action": "seek", "date": "2024-03-01T00:00:00"}  # same day, other format
    pred = QuerySpec.model_validate({**seek["gold_spec"], "timeline": timeline})
    row = score_item(seek, {"spec": pred, "status": "ok", "sql": None}, schema, None)
    assert row["spec_match"] and row["result_match"]
    wrong = QuerySpec.model_validate(
        {**seek["gold_spec"], "intent": "view", "timeline": None, "view": {"xray": True}}
    )  # noqa: E501
    row = score_item(seek, {"spec": wrong, "status": "ok", "sql": None}, schema, None)
    assert not row["result_match"]
