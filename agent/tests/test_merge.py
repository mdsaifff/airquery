from merge import merge
from spec import QuerySpec


def spec(**kw: object) -> QuerySpec:
    return QuerySpec.model_validate({"dataset": "quakes", **kw})


DEEP = {"field": "depth_km", "op": ">", "value": 300}
JAPAN = {"field": "place", "op": "contains", "value": "Japan"}
PREV = spec(
    filters=[DEEP, JAPAN],
    color_by="magnitude",
    size_by="magnitude",
    sort={"field": "magnitude", "direction": "desc"},
    limit=10,
)


def test_no_previous_spec_uses_new() -> None:
    new = spec(filters=[DEEP])
    assert merge(None, new) == new


def test_replace_uses_new_as_is() -> None:
    new = spec(mode="replace", filters=[JAPAN])
    assert merge(PREV, new) == new


def test_refine_keeps_other_filters_and_replaces_same_field() -> None:
    shallow = {"field": "depth_km", "op": "<", "value": 100}
    out = merge(PREV, spec(filters=[shallow]))
    assert [x.model_dump() for x in out.filters] == [JAPAN, shallow]


def test_refine_adds_a_new_field() -> None:
    out = merge(spec(filters=[DEEP]), spec(filters=[JAPAN]))
    assert [x.field for x in out.filters] == ["depth_km", "place"]


def test_refine_keeps_encodings_sort_and_limit_unless_set() -> None:
    out = merge(PREV, spec())
    assert (out.color_by, out.size_by, out.sort, out.limit) == (
        PREV.color_by,
        PREV.size_by,
        PREV.sort,
        PREV.limit,
    )
    out = merge(
        PREV, spec(color_by="depth_km", limit=5, sort={"field": "time", "direction": "asc"})
    )
    assert out.color_by == "depth_km"
    assert out.size_by == "magnitude"
    assert out.limit == 5
    assert out.sort is not None and out.sort.field == "time"


def test_camera_target_is_not_carried_over() -> None:
    prev = spec(camera_target={"lat": 35, "lon": 139, "label": "Japan"})
    assert merge(prev, spec(filters=[DEEP])).camera_target is None


def test_navigate_refine_keeps_filters() -> None:
    chile = {"lat": -33, "lon": -70, "label": "Chile"}
    out = merge(PREV, spec(intent="navigate", camera_target=chile))
    assert len(out.filters) == 2
    assert out.camera_target is not None and out.camera_target.label == "Chile"


def test_undo_and_reset_pass_through() -> None:
    for intent in ("undo", "reset"):
        new = spec(intent=intent)
        assert merge(PREV, new) == new


def test_other_dataset_is_not_merged() -> None:
    new = QuerySpec.model_validate({"dataset": "papers"})
    assert merge(PREV, new) == new


def test_timeline_and_view_pass_through_untouched() -> None:
    t = spec(intent="timeline", timeline={"action": "play"})
    assert merge(PREV, t) == t
    v = spec(intent="view", view={"xray": True})
    assert merge(PREV, v) == v


def test_switch_passes_through_untouched() -> None:
    s = spec(intent="switch", switch_to="papers")
    assert merge(PREV, s) == s
