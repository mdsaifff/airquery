import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from llm import (
    ClaudeLLM,
    GroqLLM,
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
    assert 8 <= len(examples) <= 13
    for ex in examples:
        out = LLMOutput.model_validate(ex["output"])
        assert (out.spec is None) != (out.clarify is None), ex["utterance"]
        if out.spec:
            scenes = [sc["name"] for sc in ex.get("scenes", [])]
            assert validate_spec(out.spec, real_quakes, scenes) == [], ex["utterance"]
        if ex["current_spec"]:
            assert validate_spec(QuerySpec.model_validate(ex["current_spec"]), real_quakes) == []


def test_prompt_contains_schema_examples_spec_and_utterance(real_quakes: DatasetSchema) -> None:
    current = QuerySpec(dataset="quakes", color_by="magnitude")
    p = build_prompt(real_quakes, 'only "deep" ones', current)
    assert "`depth_km` (number, km)" in p.system
    assert "people say: depth, deep, shallow" in p.system
    assert "Japan" in p.system  # computed examples from data_prep
    assert 'Request: "fly to Chile"' in p.system  # worked example
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
    assert make_llm("groq", "", "key").name == "openai/gpt-oss-120b"


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
    assert 8 <= len(examples) <= 13
    for ex in examples:
        out = LLMOutput.model_validate(ex["output"])
        assert (out.spec is None) != (out.clarify is None), ex["utterance"]
        if out.spec:
            assert validate_spec(out.spec, PAPERS) == [], ex["utterance"]
    assert "papers about diffusion models" in build_prompt(PAPERS, "x", None).system


class FakeCompletions:
    def __init__(self, content: str, finish_reason: str = "stop") -> None:
        self.content, self.finish_reason = content, finish_reason
        self.kwargs: dict[str, Any] = {}

    async def create(self, **kwargs: Any) -> SimpleNamespace:
        self.kwargs = kwargs
        msg = SimpleNamespace(content=self.content)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=msg, finish_reason=self.finish_reason)],
            usage=SimpleNamespace(prompt_tokens=50, completion_tokens=7),
        )


def groq_with(fake: FakeCompletions) -> GroqLLM:
    client: Any = SimpleNamespace(chat=SimpleNamespace(completions=fake))
    return GroqLLM(client)


def test_groq_adapter_returns_raw_spec_and_tokens() -> None:
    fake = FakeCompletions('{"spec": {"dataset": "quakes", "color_by": null}, "clarify": null}')
    reply = asyncio.run(groq_with(fake).complete(Prompt(system="sys", user="u")))
    assert reply.spec == {"dataset": "quakes", "color_by": None}
    assert (reply.input_tokens, reply.output_tokens) == (50, 7)
    kw = fake.kwargs
    assert kw["messages"][0] == {"role": "system", "content": "sys"}
    assert kw["response_format"] == {"type": "json_object"}
    assert kw["reasoning_effort"] == "low"
    truncated = FakeCompletions("{", finish_reason="length")
    with pytest.raises(RuntimeError, match="max_completion_tokens"):
        asyncio.run(groq_with(truncated).complete(Prompt("s", "u")))


def test_the_pointer_reaches_the_prompt(quakes_schema) -> None:
    from spec import Pointer

    here = Pointer(lat=35.24, lon=139.71)
    p = build_prompt(quakes_schema, "what happened here?", None, pointer=here)
    assert 'pointing at lat 35.2, lon 139.7 ("here")' in p.user
    assert "pointing at" not in build_prompt(quakes_schema, "x", None).user


def test_the_rules_teach_timeline_view_and_here(quakes_schema) -> None:
    system = build_prompt(quakes_schema, "x", None).system
    for needle in (
        "`timeline`",
        "`view`",
        "`switch`",
        "go to <month",
        "around here",
        "Point at a place",
        "superlative with no number",
        "narrow the screen",
    ):
        assert needle in system, needle


def test_other_scenes_reach_the_prompt(quakes_schema) -> None:
    from spec import Scene

    scenes = [
        Scene(name="quakes", title="earthquake globe"),
        Scene(name="papers", title="ML paper galaxy"),
    ]
    p = build_prompt(quakes_schema, "show the papers", None, scenes=scenes)
    assert 'Other scenes: papers ("ML paper galaxy")' in p.user
    assert "quakes (" not in p.user  # the current scene is not "other"
    assert "Other scenes" not in build_prompt(quakes_schema, "x", None, scenes=scenes[:1]).user
    assert "`switch`" in p.system
