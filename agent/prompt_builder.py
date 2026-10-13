"""Builds the LLM prompt from files in agent/prompts/, the DatasetSchema and the current spec."""

import json
from functools import cache
from pathlib import Path
from typing import Any

from llm import Prompt
from spec import DatasetSchema, QuerySpec

PROMPTS_DIR = Path(__file__).parent / "prompts"


@cache
def _system_template() -> str:
    return (PROMPTS_DIR / "system.md").read_text(encoding="utf-8")


@cache
def load_examples(dataset: str) -> tuple[dict[str, Any], ...]:
    path = PROMPTS_DIR / f"{dataset}.examples.jsonl"
    if not path.exists():
        return ()
    lines = path.read_text(encoding="utf-8").splitlines()
    return tuple(json.loads(line) for line in lines if line.strip())


def compact(spec: QuerySpec | dict[str, Any] | None) -> str:
    """Spec JSON without default values, so prompts stay short."""
    if spec is None:
        return "null"
    if isinstance(spec, dict):
        spec = QuerySpec.model_validate(spec)
    return json.dumps(spec.model_dump(mode="json", exclude_defaults=True), separators=(",", ":"))


def describe_schema(schema: DatasetSchema) -> str:
    lines = [f"`{schema.dataset}`: {schema.description}", "", "Columns:"]
    for c in schema.columns:
        kind = f"{c.type}, {c.unit}" if c.unit else c.type
        line = f"- `{c.name}` ({kind})"
        if c.min is not None and c.max is not None:
            line += f": {c.min} .. {c.max}"
        if c.examples:
            line += f"; e.g. {', '.join(c.examples)}"
        if c.synonyms:
            line += f"; people say: {', '.join(c.synonyms)}"
        lines.append(line)
    return "\n".join(lines)


def _render_examples(dataset: str) -> str:
    blocks = []
    for ex in load_examples(dataset):
        out = ex["output"]
        answer = {"spec": compact(out["spec"]) if out["spec"] else None, "clarify": out["clarify"]}
        spec_json = answer["spec"] or "null"
        clarify_json = json.dumps(answer["clarify"])
        blocks.append(
            f"Current spec: {compact(ex['current_spec'])}\n"
            f'Request: "{ex["utterance"]}"\n'
            f'Answer: {{"spec":{spec_json},"clarify":{clarify_json}}}'
        )
    return "\n\n".join(blocks)


@cache
def system_prompt(schema_json: str) -> str:
    """Stable per dataset (cache-friendly): schema + rules + examples, no request data."""
    schema = DatasetSchema.model_validate_json(schema_json)
    return (
        _system_template()
        .replace("{{schema}}", describe_schema(schema))
        .replace("{{examples}}", _render_examples(schema.dataset))
    )


def build_prompt(
    schema: DatasetSchema,
    utterance: str,
    current_spec: QuerySpec | None,
    *,
    previous: dict[str, Any] | None = None,
    errors: list[str] | None = None,
) -> Prompt:
    user = f"Current spec: {compact(current_spec)}\nRequest: {json.dumps(utterance)}"
    if errors:
        bullet_list = "\n".join(f"- {e}" for e in errors)
        user += (
            f"\n\nYour previous answer was:\n{json.dumps(previous)}\n"
            f"It failed validation:\n{bullet_list}\n"
            "Fix it and answer again, or ask a clarifying question if it cannot be fixed."
        )
    return Prompt(system=system_prompt(schema.model_dump_json()), user=user)
