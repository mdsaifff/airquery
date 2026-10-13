import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from llm import LLMReply, MockLLM
from main import create_app
from schema_registry import SchemaRegistry
from settings import settings
from spec import DatasetSchema, QueryResponse

DEEP = {"dataset": "quakes", "filters": [{"field": "depth_km", "op": ">", "value": 300}]}
LOG_KEYS = {
    "ts", "dataset", "utterance", "prev_spec", "spec", "status", "errors",
    "retries", "timings_ms", "cache_hit",
}  # fmt: skip


@pytest.fixture
def log_path(tmp_path: Path) -> Path:
    return tmp_path / "queries.jsonl"


def client(quakes_schema: DatasetSchema, log_path: Path, replies=(), rate=100, llm=True):
    mock = MockLLM(list(replies)) if llm else None
    reg = SchemaRegistry({"quakes": quakes_schema})
    app = create_app(llm=mock, registry=reg, log_path=log_path, rate_limit_per_min=rate)
    return TestClient(app), mock


def log_lines(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines()]


def ask(c: TestClient, utterance="deeper than 300 km", current_spec=None, dataset="quakes"):
    body = {"dataset": dataset, "utterance": utterance, "current_spec": current_spec}
    return c.post("/query", json=body)


def test_query_ok_matches_the_contract_and_logs_one_line(quakes_schema, log_path) -> None:
    c, _ = client(quakes_schema, log_path, [LLMReply(spec=DEEP)])
    r = ask(c)
    assert r.status_code == 200
    body = QueryResponse.model_validate(r.json())
    assert body.status == "ok"
    assert body.params == [300]
    assert body.sql and body.sql.endswith('WHERE "depth_km" > ?')
    assert body.spec is not None and body.spec.filters[0].field == "depth_km"
    assert {"llm", "validate", "compile", "total"} <= set(body.timings_ms)

    [line] = log_lines(log_path)
    assert LOG_KEYS <= set(line)
    assert line["status"] == "ok"
    assert line["utterance"] == "deeper than 300 km"
    assert line["spec"]["filters"][0]["value"] == 300
    assert line["prev_spec"] is None
    assert line["cache_hit"] is False
    assert line["ts"].endswith("Z")
    assert "llm_api_key" not in json.dumps(line).lower()


def test_cache_hit_skips_the_llm(quakes_schema, log_path) -> None:
    c, mock = client(quakes_schema, log_path, [LLMReply(spec=DEEP)])
    first = ask(c).json()
    second = ask(c, utterance="  Deeper than 300 KM ").json()  # normalized key
    assert second["sql"] == first["sql"]
    assert len(mock.calls) == 1
    assert [x["cache_hit"] for x in log_lines(log_path)] == [False, True]


def test_cache_key_includes_the_current_spec(quakes_schema, log_path) -> None:
    c, mock = client(quakes_schema, log_path, [LLMReply(spec=DEEP), LLMReply(spec=DEEP)])
    ask(c)
    ask(c, current_spec={"dataset": "quakes", "color_by": "magnitude"})
    assert len(mock.calls) == 2


def test_clarify_and_rejected_are_returned_and_logged(quakes_schema, log_path) -> None:
    c, _ = client(quakes_schema, log_path, [LLMReply(clarify="How big?")])
    assert ask(c, "the big ones").json()["status"] == "clarify"
    assert ask(c, dataset="papers").json()["status"] == "rejected"
    lines = log_lines(log_path)
    assert [x["status"] for x in lines] == ["clarify", "rejected"]
    assert lines[1]["errors"] == ["unknown dataset"]


def test_rate_limit_per_ip(quakes_schema, log_path) -> None:
    c, _ = client(quakes_schema, log_path, [LLMReply(clarify="?")], rate=2)
    assert ask(c, "a").status_code == 200
    assert ask(c, "a").status_code == 200  # cached, still counts
    r = ask(c, "a")
    assert r.status_code == 429
    assert r.json()["status"] == "rejected"
    assert log_lines(log_path)[-1]["errors"] == ["rate limited"]


def test_bad_requests_are_rejected_and_logged(quakes_schema, log_path) -> None:
    c, _ = client(quakes_schema, log_path)
    r = c.post("/query", json={"dataset": "quakes", "utterance": ""})
    assert r.status_code == 422
    assert r.json()["status"] == "rejected"
    assert log_lines(log_path)[0]["status"] == "rejected"


def test_unconfigured_llm_is_a_clear_rejection(quakes_schema, log_path) -> None:
    c, _ = client(quakes_schema, log_path, llm=False)
    body = ask(c).json()
    if settings.llm_provider:  # a real provider is configured locally; nothing to check
        pytest.skip("LLM provider configured")
    assert body["status"] == "rejected"
    assert "LLM_PROVIDER" in body["message"]


def test_cors_allows_the_web_origin(quakes_schema, log_path) -> None:
    c, _ = client(quakes_schema, log_path)
    r = c.options(
        "/query",
        headers={"Origin": settings.web_origins[0], "Access-Control-Request-Method": "POST"},
    )
    assert r.headers["access-control-allow-origin"] == settings.web_origins[0]
    r = c.options(
        "/query",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in r.headers


def test_compile_validates_and_compiles_ui_specs(quakes_schema, log_path) -> None:
    c, mock = client(quakes_schema, log_path)
    r = c.post("/compile", json={"dataset": "quakes", "spec": DEEP})
    body = QueryResponse.model_validate(r.json())
    assert body.status == "ok" and body.params == [300]
    assert body.sql is not None and body.sql.endswith('"depth_km" > ?')
    bad = {"dataset": "quakes", "filters": [{"field": "nope", "op": ">", "value": 1}]}
    r = c.post("/compile", json={"dataset": "quakes", "spec": bad})
    assert r.json()["status"] == "rejected" and "unknown field" in r.json()["message"]
    assert mock is not None and mock.calls == []  # no LLM involved
    assert not log_path.exists()  # only voice queries are logged


def test_explain_compiles_aggregates_over_ids(quakes_schema, log_path) -> None:
    c, _ = client(quakes_schema, log_path)
    body = c.post("/explain", json={"dataset": "quakes", "ids": ["a", "b"]}).json()
    assert body["status"] == "ok"
    assert body["sql"].startswith('SELECT count(*) AS "n"')
    assert body["params"] == ["a", "b"]
    assert c.post("/explain", json={"dataset": "quakes", "ids": []}).status_code == 422
