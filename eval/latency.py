"""Latency report: median and p90 per stage, from the agent log and frontend timings.

Inputs:
  agent/logs/queries.jsonl                     (written by every /query call)
  frontend-timings-*.json                      (press M in the app to download)
Usage:
  cd agent && uv run python ../eval/latency.py [frontend-timings-*.json ...]
Writes eval/reports/<date>_latency.md (never overwrites).
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent"))

from scoring import percentile  # noqa: E402

LOG = ROOT / "agent" / "logs" / "queries.jsonl"
REPORTS = Path(__file__).resolve().parent / "reports"

# docs/ARCHITECTURE.md "Latency budget" (ms); None = no budget, just measured.
BUDGET: dict[str, float | None] = {
    "stt": 300,
    "agent": 900,
    "llm": None,
    "validate+compile": 20,
    "query": 50,
    "voiceToRender": 1500,
    "frame": 1000 / 60,
    "inference": None,
    "gestures": None,
}
LABELS = {
    "stt": "end of speech -> final transcript (browser)",
    "agent": "network + agent round trip (browser)",
    "llm": "LLM parse incl. repairs (agent log)",
    "agent_total": "agent total, cache misses (agent log)",
    "validate+compile": "validate + compile (agent log)",
    "query": "DuckDB query (browser)",
    "voiceToRender": "voice -> first changed frame (browser)",
    "frame": "render CPU per frame (browser)",
    "inference": "MediaPipe per tracking frame (browser)",
    "gestures": "smoothing + classifier per tracking frame (browser)",
}


def from_log(lines: list[dict[str, Any]]) -> dict[str, list[float]]:
    misses = [x for x in lines if not x.get("cache_hit") and x.get("timings_ms", {}).get("llm")]
    t = [x["timings_ms"] for x in misses]
    return {
        "llm": [x["llm"] for x in t],
        "validate+compile": [x.get("validate", 0) + x.get("compile", 0) for x in t],
        "agent_total": [x["total"] for x in t if "total" in x],
    }


def from_frontend(files: list[dict[str, Any]]) -> dict[str, list[float]]:
    stages: dict[str, list[float]] = {}
    for f in files:
        for stage, values in f["stages"].items():
            stages.setdefault(stage, []).extend(values)
    return stages


def report(stages: dict[str, list[float]], cache_hits: int, n_log: int) -> str:
    lines = [
        f"# Latency report ({date.today().isoformat()})",
        "",
        f"{n_log} logged queries ({cache_hits} cache hits excluded from agent stages).",
        "",
        "| stage | n | median | p90 | budget | within budget (median) |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for key, label in LABELS.items():
        vals = stages.get(key, [])
        if not vals:
            continue
        p50, p90 = percentile(vals, 0.5), percentile(vals, 0.9)
        budget = BUDGET.get(key)
        ok = "–" if budget is None else ("yes" if p50 <= budget else "**no**")
        b = "–" if budget is None else f"{budget:.0f} ms"
        lines.append(f"| {label} | {len(vals)} | {p50:.1f} ms | {p90:.1f} ms | {b} | {ok} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("frontend", nargs="*", type=Path, help="frontend-timings-*.json files")
    ap.add_argument("--log", type=Path, default=LOG)
    args = ap.parse_args()
    log = []
    if args.log.exists():
        log = [json.loads(x) for x in args.log.read_text(encoding="utf-8").splitlines() if x]
    stages = {**from_frontend([json.loads(p.read_text()) for p in args.frontend]), **from_log(log)}
    if not any(stages.values()):
        raise SystemExit("no timings found: use the app (agent log) and/or pass frontend files")
    REPORTS.mkdir(exist_ok=True)
    stem, n = f"{date.today().isoformat()}_latency", 1
    while (REPORTS / f"{stem}.md").exists():
        n += 1
        stem = f"{date.today().isoformat()}_latency-{n}"
    out = REPORTS / f"{stem}.md"
    hits = sum(1 for x in log if x.get("cache_hit"))
    out.write_text(report(stages, hits, len(log)), encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
