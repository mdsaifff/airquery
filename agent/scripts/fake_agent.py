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


def voice_first(text: str, user: str, ds: dict) -> LLMReply | None:
    """Timeline, view and "here" phrasings (checked first: they reuse common words)."""
    m = re.search(r"pointing at lat (-?[\d.]+), lon (-?[\d.]+)", user)
    here = (float(m[1]), float(m[2])) if m else None
    said = text.strip().strip('"').strip()
    timeline = {
        "play the year": {"action": "play"},
        "pause": {"action": "pause"},
        "stop the replay": {"action": "stop"},
        "go to march": {"action": "seek", "date": "2024-03-01"},
        "faster": {"action": "speed", "speed": "month"},
    }
    for phrase, t in timeline.items():
        if phrase in said:
            return LLMReply(spec={**ds, "intent": "timeline", "timeline": t})
    views = {
        "x-ray on": {"xray": True},
        "x-ray off": {"xray": False},
        "show the stats": {"stats": True},
        "hide the stats": {"stats": False},
        "share this view": {"share": True},
        "be quiet": {"mute": True},
        "unmute": {"mute": False},
    }
    for phrase, v in views.items():
        if phrase in said:
            return LLMReply(spec={**ds, "intent": "view", "view": v})
    if "here" not in said:
        return None
    if here is None:
        return LLMReply(clarify="Point at a place on the globe first, then ask.")
    lat, lon = here
    if "what happened" in said:
        return LLMReply(spec={**ds, "intent": "explain"})
    if "fly here" in said:
        target = {"lat": lat, "lon": lon, "label": "here"}
        return LLMReply(spec={**ds, "intent": "navigate", "camera_target": target})
    box = [
        {"field": "lat", "op": "between", "value": [max(-90, lat - 7.5), min(90, lat + 7.5)]},
        {"field": "lon", "op": "between", "value": [max(-180, lon - 7.5), min(180, lon + 7.5)]},
    ]
    return LLMReply(spec={**ds, "mode": "replace", "filters": box})


def understand(prompt: Prompt) -> LLMReply:
    text = prompt.user.split("Request:", 1)[1].lower()
    ds = {"dataset": "quakes"}
    if reply := voice_first(text, prompt.user, ds):
        return reply
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
    if "what" in text and ("this" in text or "that" in text):
        return LLMReply(spec={**ds, "intent": "explain"})
    for intent in ("undo", "reset"):
        if intent in text:
            return LLMReply(spec={**ds, "intent": intent})
    return LLMReply(clarify="(fake agent) I only know a few phrasings, e.g. 'deeper than 300'.")


if __name__ == "__main__":
    uvicorn.run(
        create_app(
            llm=MockLLM(fn=understand, name="fake"),
            rate_limit_per_min=1000,
            compile_rate_limit_per_min=1000,
            llm_calls_per_min=1000,
        ),
        port=8000,
    )
