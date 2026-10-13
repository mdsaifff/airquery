"""LLM access. Everything goes through the LLMAdapter protocol; tests use MockLLM.

The adapter returns the model's raw proposal (an unvalidated dict) or a
clarifying question. Validation, repair and SQL happen elsewhere (graph.py).
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

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


def make_llm(provider: str, model: str, api_key: str) -> LLMAdapter:
    """Build the real adapter from settings. The provider is chosen in task T3.4."""
    if not provider:
        raise LLMNotConfiguredError(
            "LLM_PROVIDER is not set in agent/.env (provider choice pending, task T3.4)"
        )
    raise LLMNotConfiguredError(f"LLM provider {provider!r} is not implemented yet")
