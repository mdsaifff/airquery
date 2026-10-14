"""Query-accuracy evaluation: runs every utterance through the agent pipeline in-process.

Usage (from the repo root):
  make eval                                      # real provider from agent/.env
  cd agent && uv run --with duckdb python ../eval/score.py --llm gold   # harness check (100%)
  ... --llm fake                                 # keyword stand-in (scripts/fake_agent.py)
  ... --no-repair --model <id> --price-in 4 --price-out 20 --tag refine --limit 20
  ... --sample 30                                 # spread across categories (free-tier budget)

Writes eval/reports/<date>_<label>.json and .md; never overwrites an earlier report.
"""

import argparse
import asyncio
import json
import sys
import time
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

EVAL_DIR = Path(__file__).resolve().parent
ROOT = EVAL_DIR.parent
sys.path.insert(0, str(ROOT / "agent"))
sys.path.insert(0, str(EVAL_DIR))

import duckdb  # noqa: E402
from compile_sql import compile_spec  # noqa: E402
from graph import MAX_RETRIES, build_graph, run_agent  # noqa: E402
from llm import GroqLLM, LLMAdapter, LLMReply, MockLLM, Prompt, make_llm  # noqa: E402
from schema_registry import SchemaRegistry  # noqa: E402
from settings import settings  # noqa: E402
from spec import DatasetSchema, QuerySpec  # noqa: E402

from scoring import clarify_scores, navigate_ok, percentile, spec_match  # noqa: E402

DATA_DIR = ROOT / "web" / "public" / "data"
REPORTS = EVAL_DIR / "reports"


def load_items(path: Path = EVAL_DIR / "utterances.jsonl") -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def gold_oracle(items: list[dict[str, Any]]) -> MockLLM:
    """An 'LLM' that answers with the gold spec: the harness must then score 100%."""
    by_utterance = {json.dumps(i["utterance"]): i for i in items}

    def answer(prompt: Prompt) -> LLMReply:
        item = by_utterance[prompt.user.split("Request: ", 1)[1].split("\n", 1)[0]]
        if item["gold_clarify"]:
            return LLMReply(clarify="gold: clarify")
        return LLMReply(spec={**item["gold_spec"], "mode": "replace"})

    return MockLLM(fn=answer, name="gold-oracle")


def pick_llm(kind: str, model: str | None) -> LLMAdapter:
    if kind == "fake":
        sys.path.insert(0, str(ROOT / "agent" / "scripts"))
        from fake_agent import understand  # noqa: PLC0415

        return MockLLM(fn=understand, name="fake-keywords")
    llm = make_llm(settings.llm_provider, model or settings.llm_model, settings.llm_api_key)
    if isinstance(llm, GroqLLM):
        # Free tier: 8k tokens/min. Wait out 429s rather than scoring them as failures.
        llm.client = llm.client.with_options(max_retries=10)
    return llm


class Db:
    def __init__(self) -> None:
        self.con = duckdb.connect()
        parquet = (DATA_DIR / "quakes.parquet").as_posix()
        self.con.execute(f"CREATE TABLE quakes AS SELECT * FROM '{parquet}'")

    def ids(self, sql: str, params: list[Any]) -> frozenset[str]:
        return frozenset(r[0] for r in self.con.execute(sql, params).fetchall())


def score_item(item: dict, state: dict, schema: DatasetSchema, db: Db) -> dict[str, Any]:
    status = state.get("status")
    pred: QuerySpec | None = state.get("spec") if status == "ok" else None
    row: dict[str, Any] = {
        "id": item["id"],
        "tags": item["tags"],
        "utterance": item["utterance"],
        "status": status,
        "message": state.get("message"),
        "retries": state.get("retries", 0),
        "pred_spec": pred.model_dump(mode="json", exclude_defaults=True) if pred else None,
        "gold_spec": item["gold_spec"],
        "gold_clarify": item["gold_clarify"],
        "predicted_clarify": status in ("clarify", "rejected"),
        "timings_ms": state.get("timings_ms", {}),
        "tokens": state.get("tokens", {}),
        "invalid_sql": False,
    }
    pred_ids = None
    if state.get("sql"):
        try:
            pred_ids = db.ids(state["sql"], state.get("params") or [])
        except duckdb.Error as exc:  # must never happen: compile_sql only emits valid SQL
            row["invalid_sql"] = True
            row["message"] = f"invalid SQL: {exc}"
    if item["gold_clarify"]:
        row["spec_match"] = row["result_match"] = row["predicted_clarify"]
        return row
    gold = QuerySpec.model_validate(item["gold_spec"])
    row["spec_match"] = spec_match(pred, gold)
    if pred is None:
        row["result_match"] = False
    elif gold.intent in ("undo", "reset"):
        row["result_match"] = pred.intent == gold.intent
    else:
        gold_q = compile_spec(gold, schema)
        same_rows = pred_ids is not None and pred_ids == db.ids(gold_q.sql, gold_q.params)
        if gold.intent == "navigate":  # filters stay; the camera must land near the target
            same_rows = same_rows and pred.intent == "navigate" and navigate_ok(pred, gold)
        row["result_match"] = same_rows
    return row


def summarize(rows: list[dict], price_in: float | None, price_out: float | None) -> dict:
    def acc(rs: list[dict], key: str) -> float:
        return round(sum(r[key] for r in rs) / len(rs), 3) if rs else float("nan")

    by_tag: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_tag[r["tags"][0]].append(r)
    totals = [r["timings_ms"].get("total", 0.0) for r in rows]
    llm_ms = [r["timings_ms"]["llm"] for r in rows if "llm" in r["timings_ms"]]
    tin = sum(r["tokens"].get("input", 0) for r in rows)
    tout = sum(r["tokens"].get("output", 0) for r in rows)
    cost_per_100 = None
    if price_in is not None and price_out is not None and rows:
        cost_per_100 = round((tin * price_in + tout * price_out) / 1e6 / len(rows) * 100, 4)
    return {
        "n": len(rows),
        "spec_exact_match": acc(rows, "spec_match"),
        "result_set_match": acc(rows, "result_match"),
        "by_category": {
            t: {"n": len(rs), "spec": acc(rs, "spec_match"), "result": acc(rs, "result_match")}
            for t, rs in sorted(by_tag.items())
        },
        "clarify": clarify_scores([(r["gold_clarify"], r["predicted_clarify"]) for r in rows]),
        "invalid_sql": sum(r["invalid_sql"] for r in rows),
        "repairs_used": sum(1 for r in rows if r["retries"] > 0),
        "latency_ms": {
            "total_p50": percentile(totals, 0.5),
            "total_p90": percentile(totals, 0.9),
            "llm_p50": percentile(llm_ms, 0.5),
            "llm_p90": percentile(llm_ms, 0.9),
        },
        "tokens": {"input": tin, "output": tout},
        "cost_usd_per_100_queries": cost_per_100,
    }


def write_report(label: str, meta: dict, summary: dict, rows: list[dict]) -> Path:
    REPORTS.mkdir(exist_ok=True)
    stem = f"{date.today().isoformat()}_{label}"
    n = 1
    while (REPORTS / f"{stem}.json").exists():  # never overwrite an earlier report
        n += 1
        stem = f"{date.today().isoformat()}_{label}-{n}"
    (REPORTS / f"{stem}.json").write_text(
        json.dumps({"meta": meta, "summary": summary, "rows": rows}, indent=2) + "\n",
        encoding="utf-8",
    )
    lines = [
        f"# Query eval: {label}",
        "",
        f"{meta['date']} · model `{meta['model']}` · repair {'on' if meta['repair'] else 'off'} "
        f"· {summary['n']} utterances",
        "",
        "| metric | value |",
        "| --- | --- |",
        f"| spec exact match | {summary['spec_exact_match']:.1%} |",
        f"| result-set match | {summary['result_set_match']:.1%} |",
        f"| clarify precision / recall | {summary['clarify']['precision']:.2f} / "
        f"{summary['clarify']['recall']:.2f} |",
        f"| invalid SQL reaching DuckDB | {summary['invalid_sql']} |",
        f"| latency p50 / p90 (agent total) | {summary['latency_ms']['total_p50']:.0f} / "
        f"{summary['latency_ms']['total_p90']:.0f} ms |",
        f"| cost per 100 queries | {summary['cost_usd_per_100_queries'] or 'n/a'} USD |",
        "",
        "| category | n | spec | result |",
        "| --- | --- | --- | --- |",
    ]
    for tag, c in summary["by_category"].items():
        lines.append(f"| {tag} | {c['n']} | {c['spec']:.0%} | {c['result']:.0%} |")
    misses = [r for r in rows if not r["result_match"]]
    if misses:
        lines += ["", "## Misses", ""]
        for r in misses:
            got = json.dumps(r["pred_spec"]) if r["pred_spec"] else f"{r['status']}: {r['message']}"
            lines.append(f"- `{r['id']}` {r['utterance']!r} -> {got}")
    (REPORTS / f"{stem}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return REPORTS / f"{stem}.md"


async def evaluate(items: list[dict], llm: LLMAdapter, repair: bool) -> list[dict]:
    schema = SchemaRegistry.load(DATA_DIR).get("quakes")
    graph = build_graph(llm, max_retries=MAX_RETRIES if repair else 0)
    db = Db()
    rows = []
    for item in items:
        prev = QuerySpec.model_validate(item["prev_spec"]) if item["prev_spec"] else None
        state = await run_agent(graph, schema, item["utterance"], prev)
        rows.append(score_item(item, dict(state), schema, db))
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--llm", choices=["real", "gold", "fake"], default="real")
    ap.add_argument("--model", help="override LLM_MODEL for model-tier ablations")
    ap.add_argument("--no-repair", action="store_true", help="ablation: no repair retries")
    ap.add_argument("--tag", help="only items whose first tag matches")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--sample", type=int, help="N evenly spaced items across all categories")
    ap.add_argument("--price-in", type=float, help="USD per 1M input tokens")
    ap.add_argument("--price-out", type=float, help="USD per 1M output tokens")
    args = ap.parse_args()

    items = load_items()
    if args.tag:
        items = [i for i in items if i["tags"][0] == args.tag]
    items = items[: args.limit] if args.limit else items
    if args.sample:
        items = [items[i * len(items) // args.sample] for i in range(min(args.sample, len(items)))]
    llm = gold_oracle(items) if args.llm == "gold" else pick_llm(args.llm, args.model)
    t0 = time.perf_counter()
    rows = asyncio.run(evaluate(items, llm, repair=not args.no_repair))
    summary = summarize(rows, args.price_in, args.price_out)
    model = args.model or (llm.name if args.llm != "real" else settings.llm_model)
    label = model.replace("/", "_") + ("-norepair" if args.no_repair else "")
    label += f"-sample{len(items)}" if args.sample else ""
    meta = {
        "date": date.today().isoformat(),
        "model": model,
        "provider": settings.llm_provider if args.llm == "real" else args.llm,
        "repair": not args.no_repair,
        "seconds": round(time.perf_counter() - t0, 1),
    }
    path = write_report(label, meta, summary, rows)
    print(json.dumps(summary, indent=2))
    print(f"report: {path}")


if __name__ == "__main__":
    main()
