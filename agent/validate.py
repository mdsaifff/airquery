"""Checks a QuerySpec against its DatasetSchema, beyond what Pydantic types cover.

Returns human-readable errors; they are fed back to the LLM in the repair step,
so each one names the field and says what would be valid.
"""

from collections.abc import Collection
from datetime import date, datetime

from schema_registry import allowed_ops
from spec import Column, DatasetSchema, Filter, QuerySpec, Scalar

RANGE_SLACK = 0.5  # numeric values may sit up to 50% of the span outside [min, max]
MAX_IN_ITEMS = 50
MAX_TEXT_LEN = 100
MAX_LAST_DAYS = 36_500


def _is_number(v: object) -> bool:
    return isinstance(v, int | float) and not isinstance(v, bool)


def _is_date(v: object) -> bool:
    if not isinstance(v, str):
        return False
    try:
        datetime.fromisoformat(v) if "T" in v or " " in v else date.fromisoformat(v)
    except ValueError:
        return False
    return True


def _check_scalar(col: Column, v: Scalar) -> str | None:
    if col.type == "number":
        if not _is_number(v):
            return f"{col.name} is numeric; got {v!r}"
        if isinstance(col.min, int | float) and isinstance(col.max, int | float):
            slack = (col.max - col.min) * RANGE_SLACK
            lo, hi = col.min - slack, col.max + slack
            if not lo <= v <= hi:
                return f"{col.name} value {v} is outside the data range {col.min}..{col.max}"
    elif col.type == "timestamp":
        if not _is_date(v):
            return f"{col.name} needs an ISO date like 2024-03-01; got {v!r}"
    elif not isinstance(v, str) or not v.strip() or len(v) > MAX_TEXT_LEN:
        return f"{col.name} needs a short non-empty text value; got {v!r}"
    return None


def _check_filter(f: Filter, schema: DatasetSchema) -> list[str]:
    col = schema.column(f.field)
    if col is None:
        known = ", ".join(c.name for c in schema.columns)
        return [f"unknown field {f.field!r}; filterable fields are: {known}"]
    ops = allowed_ops(col)
    if f.op not in ops:
        return [
            f"operator {f.op!r} does not fit {col.type} field {col.name}; use one of {sorted(ops)}"
        ]

    if f.op == "between":
        if not isinstance(f.value, list) or len(f.value) != 2:
            return [f"{col.name} between needs a list of exactly 2 values"]
        errors = [e for v in f.value if (e := _check_scalar(col, v))]
        lo, hi = f.value
        if not errors and lo > hi:  # same type here: both passed _check_scalar
            errors.append(f"{col.name} between needs [low, high]; got {f.value}")
        return errors
    if f.op == "in":
        if not isinstance(f.value, list) or not 1 <= len(f.value) <= MAX_IN_ITEMS:
            return [f"{col.name} in needs a list of 1..{MAX_IN_ITEMS} values"]
        return [e for v in f.value if (e := _check_scalar(col, v))]
    if isinstance(f.value, list):
        return [f"{col.name} {f.op} needs a single value, not a list"]
    if f.op == "last_days":
        v = f.value
        if not (isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= MAX_LAST_DAYS):
            return [f"{col.name} last_days needs a whole number of days (1..{MAX_LAST_DAYS})"]
        return []
    err = _check_scalar(col, f.value)
    return [err] if err else []


def validate_spec(
    spec: QuerySpec, schema: DatasetSchema, scenes: Collection[str] = ()
) -> list[str]:
    """scenes: every scene the browser can show (for intent switch), current one included."""
    errors: list[str] = []
    if spec.dataset != schema.dataset:
        errors.append(f"dataset must be {schema.dataset!r}; got {spec.dataset!r}")
    for f in spec.filters:
        errors += _check_filter(f, schema)

    numeric = {c.name for c in schema.columns if c.type == "number"}
    colorable = numeric | {c.name for c in schema.columns if c.type == "timestamp" or c.categorical}
    if spec.color_by is not None and spec.color_by not in colorable:
        errors.append(f"color_by must be one of {sorted(colorable)}; got {spec.color_by!r}")
    if spec.size_by is not None and spec.size_by not in numeric:
        errors.append(f"size_by must be one of {sorted(numeric)}; got {spec.size_by!r}")
    if spec.sort is not None and schema.column(spec.sort.field) is None:
        errors.append(f"unknown sort field {spec.sort.field!r}")
    if spec.sort is not None and spec.limit is None:
        # A bare sort reorders points nobody sees in order: nothing changes on screen.
        errors.append("a sort needs a limit (e.g. limit 50 for 'the deepest ones')")
    if spec.intent == "navigate" and spec.camera_target is None:
        errors.append("intent navigate needs a camera_target with lat, lon and label")
    return errors + _check_timeline_view(spec, schema) + _check_switch(spec, schema, scenes)


def _check_switch(spec: QuerySpec, schema: DatasetSchema, scenes: Collection[str]) -> list[str]:
    if spec.intent != "switch":
        return [] if spec.switch_to is None else ["switch_to is only for intent switch"]
    others = sorted(s for s in scenes if s != schema.dataset)
    if not others:
        return ["there is no other scene to switch to"]
    if spec.switch_to not in others:
        return [f"switch_to must be one of {others}; got {spec.switch_to!r}"]
    return []


def _check_timeline_view(spec: QuerySpec, schema: DatasetSchema) -> list[str]:
    errors: list[str] = []
    t, v = spec.timeline, spec.view
    if spec.intent == "timeline":
        time_col = next((c for c in schema.columns if c.type == "timestamp"), None)
        if t is None:
            errors.append("intent timeline needs a timeline object {action, date, speed}")
        elif time_col is None:
            errors.append("this dataset has no time column, so there is no timeline to play")
        else:
            if t.action == "seek":
                if t.date is None or not _is_date(t.date):
                    errors.append("timeline seek needs a date like 2024-03-01")
                elif isinstance(time_col.min, str) and isinstance(time_col.max, str):
                    lo, hi = time_col.min[:10], time_col.max[:10]
                    if not lo <= t.date[:10] <= hi:
                        errors.append(
                            f"timeline date {t.date[:10]} is outside the data ({lo}..{hi})"
                        )
            if t.action == "speed" and t.speed is None:
                errors.append("timeline speed needs speed: day, week or month")
    elif t is not None:
        errors.append("timeline is only for intent timeline")
    if spec.intent == "view":
        if v is None or all(x is None for x in (v.xray, v.stats, v.share, v.mute)):
            errors.append("intent view needs at least one of xray, stats, share, mute")
    elif v is not None:
        errors.append("view is only for intent view")
    return errors
