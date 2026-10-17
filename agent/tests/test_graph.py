import asyncio

from graph import build_graph, run_agent
from llm import LLMReply, MockLLM
from spec import DatasetSchema, QuerySpec, Scene

DEEP = {"dataset": "quakes", "filters": [{"field": "depth_km", "op": ">", "value": 300}]}
BAD_FIELD = {"dataset": "quakes", "filters": [{"field": "depth", "op": ">", "value": 300}]}
BAD_RANGE = {"dataset": "quakes", "filters": [{"field": "depth_km", "op": ">", "value": 9000}]}
BAD_OP = {"dataset": "quakes", "filters": [{"field": "depth_km", "op": "deeper", "value": 3}]}


def run(
    schema: DatasetSchema, replies: list[LLMReply], prev: QuerySpec | None = None, raises=False
):
    def boom(_prompt):
        raise TimeoutError("provider timed out")

    mock = MockLLM(replies, fn=boom if raises else None)
    state = asyncio.run(run_agent(build_graph(mock), schema, "deeper than 300 km", prev))
    return state, mock


def test_success(quakes_schema: DatasetSchema) -> None:
    state, mock = run(quakes_schema, [LLMReply(spec=DEEP, input_tokens=900, output_tokens=40)])
    assert state["status"] == "ok"
    assert (
        state["sql"] == 'SELECT "id", "lat", "lon", "depth_km" FROM "quakes" WHERE "depth_km" > ?'
    )
    assert state["params"] == [300]
    assert state["retries"] == 0
    assert state["tokens"] == {"input": 900, "output": 40}
    assert {"llm", "validate", "compile", "total"} <= set(state["timings_ms"])
    assert len(mock.calls) == 1


def test_refine_merges_with_the_previous_spec(quakes_schema: DatasetSchema) -> None:
    prev = QuerySpec(dataset="quakes", color_by="magnitude")
    state, _ = run(quakes_schema, [LLMReply(spec=DEEP)], prev)
    assert state["spec"].color_by == "magnitude"
    assert state["spec"].filters[0].field == "depth_km"
    assert '"magnitude"' in state["sql"]  # encoding column selected


def test_one_repair(quakes_schema: DatasetSchema) -> None:
    state, mock = run(quakes_schema, [LLMReply(spec=BAD_FIELD), LLMReply(spec=DEEP)])
    assert state["status"] == "ok"
    assert state["retries"] == 1
    assert len(mock.calls) == 2
    repair_prompt = mock.calls[1].user
    assert "unknown field 'depth'" in repair_prompt
    assert '"field": "depth"' in repair_prompt  # shows the failed answer


def test_pydantic_errors_are_repaired_too(quakes_schema: DatasetSchema) -> None:
    state, mock = run(quakes_schema, [LLMReply(spec=BAD_OP), LLMReply(spec=DEEP)])
    assert state["status"] == "ok"
    assert "filters.0.op" in mock.calls[1].user


def test_exhausted_retries_on_an_impossible_request_reject(quakes_schema: DatasetSchema) -> None:
    state, mock = run(quakes_schema, [LLMReply(spec=BAD_FIELD)] * 3)
    assert state["status"] == "rejected"
    assert state["retries"] == 2
    assert len(mock.calls) == 3
    assert "You can filter by: time, lat, lon, depth_km" in state["message"]
    assert state.get("spec") is None and state.get("sql") is None  # never an unvalidated spec


def test_exhausted_retries_on_a_bad_value_clarify(quakes_schema: DatasetSchema) -> None:
    state, _ = run(quakes_schema, [LLMReply(spec=BAD_RANGE)] * 3)
    assert state["status"] == "clarify"
    assert "outside the data range" in state["message"]
    assert state.get("sql") is None


def test_clarify_when_the_llm_asks(quakes_schema: DatasetSchema) -> None:
    state, mock = run(quakes_schema, [LLMReply(clarify="How big? Magnitude 6 and up?")])
    assert state["status"] == "clarify"
    assert state["message"] == "How big? Magnitude 6 and up?"
    assert len(mock.calls) == 1
    assert state.get("sql") is None


def test_undo_returns_the_intent_without_sql(quakes_schema: DatasetSchema) -> None:
    state, _ = run(quakes_schema, [LLMReply(spec={"dataset": "quakes", "intent": "undo"})])
    assert state["status"] == "ok"
    assert state["spec"].intent == "undo"
    assert state["sql"] is None


def test_provider_failure_is_rejected(quakes_schema: DatasetSchema) -> None:
    state, _ = run(quakes_schema, [], raises=True)
    assert state["status"] == "rejected"
    assert "TimeoutError" in state["message"]


def test_invalid_current_spec_is_rejected_without_calling_the_llm(
    quakes_schema: DatasetSchema,
) -> None:
    prev = QuerySpec.model_validate(BAD_FIELD)
    state, mock = run(quakes_schema, [], prev)
    assert state["status"] == "rejected"
    assert "current_spec is not valid" in state["message"]
    assert mock.calls == []


def test_timeline_and_view_produce_no_sql(quakes_schema: DatasetSchema) -> None:
    for out in (
        {
            "dataset": "quakes",
            "intent": "timeline",
            "timeline": {"action": "play", "speed": "month"},
        },
        {"dataset": "quakes", "intent": "view", "view": {"xray": True}},
    ):
        state, _ = run(quakes_schema, [LLMReply(spec=out)])
        assert state["status"] == "ok" and state["sql"] is None
        assert state["spec"].intent == out["intent"]


def test_switch_produces_no_sql(quakes_schema: DatasetSchema) -> None:
    out = {"dataset": "quakes", "intent": "switch", "switch_to": "papers"}
    mock = MockLLM([LLMReply(spec=out)])
    graph = build_graph(mock)
    state = asyncio.run(
        run_agent(
            graph,
            quakes_schema,
            "show the papers",
            None,
            scenes=[Scene(name="papers", title="galaxy")],
        )
    )
    assert state["status"] == "ok" and state["sql"] is None
    assert state["spec"].switch_to == "papers"


def test_a_timeline_on_data_without_dates_answers_at_once(quakes_schema: DatasetSchema) -> None:
    no_dates = quakes_schema.model_copy(
        update={"columns": [c for c in quakes_schema.columns if c.type != "timestamp"]}
    )
    play = {"dataset": "quakes", "intent": "timeline", "timeline": {"action": "play"}}
    state, mock = run(no_dates, [LLMReply(spec=play)] * 3)
    assert len(mock.calls) == 1  # no repairs: asking again cannot add dates
    assert state["status"] == "clarify"
    assert state["message"] == "This data has no dates, so there is no timeline to play."


def test_a_spec_without_dataset_gets_the_current_one(quakes_schema: DatasetSchema) -> None:
    # Seen live: "switch to the earthquakes" from the stars came back without "dataset"
    play = {"intent": "timeline", "timeline": {"action": "play"}}
    state, mock = run(quakes_schema, [LLMReply(spec=play)])
    assert len(mock.calls) == 1 and state["status"] == "ok"
    assert state["spec"].dataset == "quakes"


def test_a_sort_keeps_the_limit_it_refines(quakes_schema: DatasetSchema) -> None:
    # "the ten strongest", then "now by depth": the merged spec still has its limit
    prev = QuerySpec(dataset="quakes", sort={"field": "magnitude"}, limit=10)
    by_depth = {"dataset": "quakes", "sort": {"field": "depth_km"}}
    state, mock = run(quakes_schema, [LLMReply(spec=by_depth)], prev)
    assert len(mock.calls) == 1 and state["status"] == "ok"
    assert state["sql"].endswith('ORDER BY "depth_km" DESC NULLS LAST LIMIT 10')
