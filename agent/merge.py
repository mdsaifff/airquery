"""Deterministic refine merge (docs/ARCHITECTURE.md "Refine merge rules")."""

from spec import QuerySpec


def merge(prev: QuerySpec | None, new: QuerySpec) -> QuerySpec:
    """Apply `new` on top of `prev`.

    - replace (or no previous spec, or a different dataset): `new` as is.
    - undo / reset: returned as is; the frontend's history stack handles them.
    - refine: a filter on a field replaces earlier filters on that field, other
      filters are kept; color_by, size_by, sort and limit change only when set.
      camera_target is a one-off move and is never carried over.
    """
    if (
        prev is None
        or new.mode == "replace"
        or new.intent in ("undo", "reset")
        or prev.dataset != new.dataset
    ):
        return new
    new_fields = {f.field for f in new.filters}
    kept = [f for f in prev.filters if f.field not in new_fields]
    return new.model_copy(
        update={
            "filters": kept + list(new.filters),
            "color_by": new.color_by if new.color_by is not None else prev.color_by,
            "size_by": new.size_by if new.size_by is not None else prev.size_by,
            "sort": new.sort if new.sort is not None else prev.sort,
            "limit": new.limit if new.limit is not None else prev.limit,
        }
    )
