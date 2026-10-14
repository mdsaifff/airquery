import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from llm import (
    ClaudeLLM,
    LLMNotConfiguredError,
    LLMOutput,
    LLMRefusedError,
    LLMReply,
    MockLLM,
    Prompt,
    make_llm,
)
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
    with pytest.raises(LLMNotConfiguredError, match="not supported"):
        make_llm("openai", "", "")
    assert make_llm("anthropic", "", "key").name == "claude-opus-5-5"


class FakeMessages:
    """Stands in for client.beta.messages: records the request, returns a canned response."""

    def __init__(self, text: str, stop_reason: str = "end_turn") -> None:
        self.text, self.stop_reason = text, stop_reason
        self.kwargs: dict[str, Any] = {}

    async def create(self, **kwargs: Any) -> SimpleNamespace:
        self.kwargs = kwargs
        usage = SimpleNamespace(
            input_tokens=10,
            cache_read_input_tokens=90,
            cache_creation_input_tokens=0,
            output_tokens=20,
        )
        content = [SimpleNamespace(type="thinking"), SimpleNamespace(type="text", text=self.text)]
        return SimpleNamespace(
            stop_reason=self.stop_reason, stop_details=None, content=content, usage=usage
        )


def claude_with(messages: FakeMessages, model: str = "claude-opus-5-5") -> ClaudeLLM:
    client: Any = SimpleNamespace(beta=SimpleNamespace(messages=messages))
    return ClaudeLLM(client, model)


def test_claude_adapter_returns_raw_spec_and_tokens() -> None:
    fake = FakeMessages('{"spec": {"dataset": "quakes", "limit": 0}, "clarify": null}')
    reply = asyncio.run(claude_with(fake).complete(Prompt(system="sys", user="u")))
    # Unvalidated on purpose (limit 0 is out of range): validate.py + repair handle it.
    assert reply.spec == {"dataset": "quakes", "limit": 0}
    assert reply.clarify is None
    assert (reply.input_tokens, reply.output_tokens) == (100, 20)
    kw = fake.kwargs
    assert kw["system"][0] == {
        "type": "text",
        "text": "sys",
        "cache_control": {"type": "ephemeral"},
    }
    assert kw["output_config"]["format"]["type"] == "json_schema"
    assert kw["fallbacks"] == "default"
    # Haiku has no server-side fallback.
    asyncio.run(claude_with(fake, "claude-haiku-5-5").complete(Prompt(system="s", user="u")))
    assert "fallbacks" not in fake.kwargs


def test_claude_adapter_clarify_and_refusal() -> None:
    fake = FakeMessages('{"spec": null, "clarify": "How big?"}')
    assert asyncio.run(claude_with(fake).complete(Prompt("s", "u"))).clarify == "How big?"
    refused = FakeMessages("", stop_reason="refusal")
    with pytest.raises(LLMRefusedError):
        asyncio.run(claude_with(refused).complete(Prompt("s", "u")))


PAPERS = DatasetSchema.model_validate(
    {
        "dataset": "papers",
        "table": "papers",
        "description": "stand-in for papers.schema.json",
        "position": {"kind": "xyz", "x": "x", "y": "y", "z": "z"},
        "columns": [
            {"name": "title", "type": "text"},
            {"name": "year", "type": "number", "min": 2019, "max": 2025},
            {
                "name": "field",
                "type": "text",
                "categorical": True,
                "examples": ["machine learning", "language", "vision"],
            },
        ],
    }
)


def test_papers_examples_are_valid() -> None:
    examples = load_examples("papers")
    assert 8 <= len(examples) <= 12
    for ex in examples:
        out = LLMOutput.model_validate(ex["output"])
        assert (out.spec is None) != (out.clarify is None), ex["utterance"]
        if out.spec:
            assert validate_spec(out.spec, PAPERS) == [], ex["utterance"]
    assert "papers about diffusion models" in build_prompt(PAPERS, "x", None).system
