import asyncio
import json
from pathlib import Path

import pytest

from llm import LLMNotConfiguredError, LLMOutput, LLMReply, MockLLM, Prompt, make_llm
from prompt_builder import build_prompt, compact, load_examples, system_prompt
from schema_registry import SchemaRegistry
from settings import settings
from spec import DatasetSchema, QuerySpec
from validate import validate_spec


@pytest.fixture
def real_quakes() -> DatasetSchema:
    return SchemaRegistry.load(Path(settings.schema_dir)).get("quakes")


def test_worked_examples_are_valid_against_the_real_schema(real_quakes: DatasetSchema) -> None:
    examples = load_examples("quakes")
    assert 8 <= len(examples) <= 12
    for ex in examples:
        out = LLMOutput.model_validate(ex["output"])
        assert (out.spec is None) != (out.clarify is None), ex["utterance"]
        if out.spec:
            assert validate_spec(out.spec, real_quakes) == [], ex["utterance"]
        if ex["current_spec"]:
            assert validate_spec(QuerySpec.model_validate(ex["current_spec"]), real_quakes) == []


def test_prompt_contains_schema_examples_spec_and_utterance(real_quakes: DatasetSchema) -> None:
    current = QuerySpec(dataset="quakes", color_by="magnitude")
    p = build_prompt(real_quakes, 'only "deep" ones', current)
    assert "`depth_km` (number, km)" in p.system
    assert "people say: depth, deep, shallow" in p.system
    assert "Japan" in p.system  # computed examples from data_prep
    assert 'Request: "show the ten strongest"' in p.system  # worked example
    assert "{{" not in p.system
    assert p.user == (
        'Current spec: {"dataset":"quakes","color_by":"magnitude"}\nRequest: "only \\"deep\\" ones"'
    )


def test_system_prompt_is_stable_for_caching(real_quakes: DatasetSchema) -> None:
    a = build_prompt(real_quakes, "one", None).system
    b = build_prompt(real_quakes, "two", QuerySpec(dataset="quakes")).system
    assert a == b
    assert system_prompt.cache_info().hits >= 1


def test_repair_prompt_shows_the_failed_answer_and_errors(real_quakes: DatasetSchema) -> None:
    bad = {"dataset": "quakes", "filters": [{"field": "depth", "op": ">", "value": 3}]}
    p = build_prompt(real_quakes, "deep", None, previous=bad, errors=["unknown field 'depth'"])
    assert json.dumps(bad) in p.user
    assert "- unknown field 'depth'" in p.user


def test_compact_drops_defaults() -> None:
    assert compact(None) == "null"
    assert compact({"dataset": "quakes", "mode": "refine"}) == '{"dataset":"quakes"}'


def test_mock_llm_replays_scripted_replies() -> None:
    mock = MockLLM([LLMReply(spec={"dataset": "quakes"}), LLMReply(clarify="which?")])
    p = Prompt(system="s", user="u")
    assert asyncio.run(mock.complete(p)).spec == {"dataset": "quakes"}
    assert asyncio.run(mock.complete(p)).clarify == "which?"
    assert len(mock.calls) == 2
    with pytest.raises(AssertionError):
        asyncio.run(mock.complete(p))


def test_unconfigured_provider_fails_clearly() -> None:
    with pytest.raises(LLMNotConfiguredError, match="LLM_PROVIDER"):
        make_llm("", "", "")
