"""LLM access. Everything goes through the LLMAdapter protocol; tests use MockLLM.

The adapter returns the model's raw proposal (an unvalidated dict) or a
clarifying question. Validation, repair and SQL happen elsewhere (graph.py).
"""

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

import anthropic
import groq
from pydantic import BaseModel

from spec import QuerySpec


class LLMOutput(BaseModel):
    """What the model is asked to produce: a spec, or a question when ambiguous."""

    spec: QuerySpec | None = None
    clarify: str | None = None


@dataclass
class Prompt:
    system: str
    user: str


@dataclass
class LLMReply:
    """Raw model output. `spec` is unvalidated JSON exactly as the model wrote it."""

    spec: dict[str, Any] | None = None
    clarify: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0


class LLMAdapter(Protocol):
    name: str

    async def complete(self, prompt: Prompt) -> LLMReply: ...


@dataclass
class MockLLM:
    """Scripted replies for tests. Each call pops the next reply (or calls `fn`)."""

    replies: Sequence[LLMReply] = ()
    fn: Callable[[Prompt], LLMReply] | None = None
    name: str = "mock"
    calls: list[Prompt] = field(default_factory=list)

    async def complete(self, prompt: Prompt) -> LLMReply:
        self.calls.append(prompt)
        if self.fn is not None:
            return self.fn(prompt)
        if len(self.calls) > len(self.replies):
            raise AssertionError(f"MockLLM got call {len(self.calls)} but has {len(self.replies)}")
        return self.replies[len(self.calls) - 1]


class LLMNotConfiguredError(RuntimeError):
    pass


class LLMRefusedError(RuntimeError):
    pass


# Constrained decoding keeps the reply valid JSON of this shape; the numeric ranges
# it can't express are checked by validate.py, which feeds the repair loop.
OUTPUT_SCHEMA = anthropic.transform_schema(LLMOutput)
# Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
FALLBACK_MODELS = {"claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}
DEFAULT_MODEL = "claude-opus-5-5"
GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"


def _all_required(node: Any) -> Any:
    """Groq strict mode: every property listed in `required` (optional ones stay nullable)."""
    if isinstance(node, dict):
        node = {k: _all_required(v) for k, v in node.items()}
        if node.get("type") == "object" and "properties" in node:
            node["required"] = list(node["properties"])
        return node
    if isinstance(node, list):
        return [_all_required(v) for v in node]
    return node


# Explicit nulls are safe: merge.py treats a null field as "keep the previous value".
GROQ_OUTPUT_SCHEMA = _all_required(OUTPUT_SCHEMA)


@dataclass
class ClaudeLLM:
    """Claude via the Anthropic SDK, answering with JSON constrained to OUTPUT_SCHEMA."""

    client: anthropic.AsyncAnthropic
    model: str = DEFAULT_MODEL
    effort: str = "low"  # thinking depth: low | medium | high | xhigh | max

    @property
    def name(self) -> str:
        return self.model

    async def complete(self, prompt: Prompt) -> LLMReply:
        extra: dict[str, Any] = {}
        if self.model in FALLBACK_MODELS:
            extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
        resp = await self.client.beta.messages.create(
            model=self.model,
            max_tokens=4096,
            # The system prompt is fixed per dataset, so it is cached across requests.
            system=[
                {"type": "text", "text": prompt.system, "cache_control": {"type": "ephemeral"}}
            ],
            messages=[{"role": "user", "content": prompt.user}],
            output_config={
                "effort": self.effort,
                "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA},
            },
            **extra,
        )
        if resp.stop_reason == "refusal":
            raise LLMRefusedError(f"model declined the request ({resp.stop_details})")
        if resp.stop_reason == "max_tokens":
            raise RuntimeError("model reply hit max_tokens")
        text = next(b.text for b in resp.content if b.type == "text")
        out = json.loads(text)
        u = resp.usage
        return LLMReply(
            spec=out.get("spec"),
            clarify=out.get("clarify"),
            input_tokens=u.input_tokens
            + (u.cache_read_input_tokens or 0)
            + (u.cache_creation_input_tokens or 0),
            output_tokens=u.output_tokens,
        )


@dataclass
class GroqLLM:
    """Open-weight models on Groq (free tier), JSON in strict json_schema mode.

    Strict mode is supported on openai/gpt-oss-120b, openai/gpt-oss-20b and qwen/qwen3.8-27b.
    """

    client: groq.AsyncGroq
    model: str = GROQ_DEFAULT_MODEL
    effort: str = "low"  # gpt-oss reasoning_effort: low | medium | high

    @property
    def name(self) -> str:
        return self.model

    async def complete(self, prompt: Prompt) -> LLMReply:
        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": prompt.system},
                {"role": "user", "content": prompt.user},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "llm_output", "strict": True, "schema": GROQ_OUTPUT_SCHEMA},
            },
            reasoning_effort=self.effort,  # type: ignore[arg-type]
            max_completion_tokens=4096,
        )
        choice = resp.choices[0]
        if choice.finish_reason == "length":
            raise RuntimeError("model reply hit max_completion_tokens")
        out = json.loads(choice.message.content or "{}")
        u = resp.usage
        return LLMReply(
            spec=out.get("spec"),
            clarify=out.get("clarify"),
            input_tokens=u.prompt_tokens if u else 0,
            output_tokens=u.completion_tokens if u else 0,
        )


def make_llm(provider: str, model: str, api_key: str, effort: str = "low") -> LLMAdapter:
    """Build the real adapter from settings (LLM_PROVIDER / LLM_MODEL / LLM_API_KEY)."""
    # An empty key lets each SDK fall back to its own env var (GROQ_API_KEY, ANTHROPIC_API_KEY).
    if provider == "groq":
        try:
            client = groq.AsyncGroq(api_key=api_key or None, timeout=30.0)
        except groq.GroqError as exc:  # no key anywhere
            raise LLMNotConfiguredError(f"Groq API key missing: set LLM_API_KEY ({exc})") from exc
        return GroqLLM(client, model or GROQ_DEFAULT_MODEL, effort)
    if provider == "anthropic":
        client = anthropic.AsyncAnthropic(api_key=api_key or None, timeout=30.0)
        return ClaudeLLM(client, model or DEFAULT_MODEL, effort)
    hint = "set LLM_PROVIDER=groq (free) or anthropic in agent/.env"
    if not provider:
        raise LLMNotConfiguredError(f"LLM_PROVIDER is not set: {hint}")
    raise LLMNotConfiguredError(f"LLM provider {provider!r} is not supported: {hint}")
