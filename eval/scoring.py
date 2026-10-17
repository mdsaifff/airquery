"""Pure scoring helpers for the query-accuracy evaluation (docs/EVAL.md section 3)."""

import json
import math
from typing import Any

from spec import QuerySpec

NAVIGATE_TOLERANCE_KM = 600  # a fly-to counts if it lands within this of the gold target


def _num(v: Any) -> Any:
    if isinstance(v, bool):
        return v
    if isinstance(v, int | float):
        return float(v)
    if isinstance(v, list):
        return [_num(x) for x in v]
    if isinstance(v, str):
        return v.strip().lower()
    return v


def normalize(spec: dict[str, Any] | QuerySpec) -> dict[str, Any]:
    """Comparable form: no mode/version, filters sorted, numbers as floats, text lowercased.

    camera_target is compared separately (navigate_ok), so it is dropped here.
    """
    q = QuerySpec.model_validate(spec).model_dump(mode="json")
    for key in ("mode", "version", "camera_target"):
        q.pop(key, None)
    if q.get("timeline") and q["timeline"].get("date"):  # a day, whatever the format
        q["timeline"]["date"] = q["timeline"]["date"][:10]
    q["filters"] = sorted(
        ({"field": f["field"], "op": f["op"], "value": _num(f["value"])} for f in q["filters"]),
        key=lambda f: json.dumps(f, sort_keys=True),
    )
    return q


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def navigate_ok(pred: QuerySpec, gold: QuerySpec) -> bool:
    if gold.camera_target is None:
        return pred.camera_target is None
    if pred.camera_target is None:
        return False
    g, p = gold.camera_target, pred.camera_target
    return haversine_km(g.lat, g.lon, p.lat, p.lon) <= NAVIGATE_TOLERANCE_KM


def spec_match(pred: QuerySpec | None, gold: QuerySpec) -> bool:
    if pred is None:
        return False
    return normalize(pred) == normalize(gold) and navigate_ok(pred, gold)


def percentile(values: list[float], p: float) -> float:
    if not values:
        return float("nan")
    s = sorted(values)
    return s[min(len(s) - 1, max(0, math.ceil(p * len(s)) - 1))]


def clarify_scores(rows: list[tuple[bool, bool]]) -> dict[str, float]:
    """rows: (gold_clarify, predicted_clarify). Precision/recall of asking instead of guessing."""
    tp = sum(1 for g, p in rows if g and p)
    fp = sum(1 for g, p in rows if not g and p)
    fn = sum(1 for g, p in rows if g and not p)
    precision = tp / (tp + fp) if tp + fp else float("nan")
    recall = tp / (tp + fn) if tp + fn else float("nan")
    return {"tp": tp, "fp": fp, "fn": fn, "precision": precision, "recall": recall}
