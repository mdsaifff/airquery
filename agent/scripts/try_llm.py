"""Manual check (not a test): send 5 utterances to the real provider and print the specs.

Needs LLM_PROVIDER / LLM_MODEL / LLM_API_KEY in agent/.env.
Usage: uv run python scripts/try_llm.py ["another utterance" ...]
"""

import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from llm import make_llm  # noqa: E402
from prompt_builder import build_prompt  # noqa: E402
from schema_registry import SchemaRegistry  # noqa: E402
from settings import settings  # noqa: E402

UTTERANCES = [
    "only show quakes deeper than 300 kilometres",
    "colour them by magnitude",
    "show the ten strongest",
    "just the ones in Japan in 2024",
    "fly to Chile",
]


async def main(utterances: list[str]) -> None:
    llm = make_llm(settings.llm_provider, settings.llm_model, settings.llm_api_key)
    schema = SchemaRegistry.load(settings.schema_dir).get("quakes")
    for u in utterances:
        t0 = time.perf_counter()
        reply = await llm.complete(build_prompt(schema, u, None))
        ms = (time.perf_counter() - t0) * 1000
        print(f"\n> {u}  ({ms:.0f} ms, {reply.input_tokens}+{reply.output_tokens} tokens)")
        print(json.dumps(reply.spec, indent=2) if reply.spec else f"clarify: {reply.clarify}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or UTTERANCES))
