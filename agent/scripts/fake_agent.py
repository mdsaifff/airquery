"""Dev-only: run the real agent with a keyword-matching MockLLM instead of a provider.

Lets you try the whole UI (CORS, validation, SQL, DuckDB, scene) without an
API key. Not for evaluation: it understands only a handful of phrasings.
Usage: uv run python scripts/fake_agent.py   (serves on :8000)
"""

import re
import sys
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from llm import LLMReply, MockLLM, Prompt  # noqa: E402
from main import create_app  # noqa: E402

NUMBER = r"(\d+(?:\.\d+)?)"


def understand(prompt: Prompt) -> LLMReply:
    text = prompt.user.split("Request:", 1)[1].lower()
    ds = {"dataset": "quakes"}
    if m := re.search(rf"(?:deeper|more) than {NUMBER}", text):
        return LLMReply(
            spec={**ds, "filters": [{"field": "depth_km", "op": ">", "value": float(m[1])}]}
        )
    if m := re.search(rf"shallower than {NUMBER}", text):
        return LLMReply(
            spec={**ds, "filters": [{"field": "depth_km", "op": "<", "value": float(m[1])}]}
        )
    if m := re.search(rf"(?:magnitude|stronger than) {NUMBER}", text):
        return LLMReply(
            spec={**ds, "filters": [{"field": "magnitude", "op": ">=", "value": float(m[1])}]}
        )
    if m := re.search(r"colou?r (?:them |it )?by (\w+)", text):
        col = {"depth": "depth_km", "time": "time", "date": "time"}.get(m[1], "magnitude")
        return LLMReply(spec={**ds, "color_by": col})
    if m := re.search(r"(\w+) strongest", text):
        n = {"ten": 10, "five": 5, "twenty": 20}.get(m[1], 10)
        return LLMReply(
            spec={**ds, "sort": {"field": "magnitude", "direction": "desc"}, "limit": n}
        )
    if m := re.search(r"(?:near|in) ([a-z ]+?)[\".]*$", text):
        place = m[1].strip().title()
        return LLMReply(
            spec={**ds, "filters": [{"field": "place", "op": "contains", "value": place}]}
        )
    if "fly to chile" in text:
        target = {"lat": -33.4, "lon": -70.6, "label": "Chile"}
        return LLMReply(spec={**ds, "intent": "navigate", "camera_target": target})
    for intent in ("undo", "reset"):
        if intent in text:
            return LLMReply(spec={**ds, "intent": intent})
    return LLMReply(clarify="(fake agent) I only know a few phrasings, e.g. 'deeper than 300'.")


if __name__ == "__main__":
    uvicorn.run(create_app(llm=MockLLM(fn=understand, name="fake")), port=8000)
