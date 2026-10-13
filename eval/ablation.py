"""Ablation summary: collect eval reports into a table and an accuracy-vs-cost chart.

Run the configurations first, e.g. for each model tier:
  make eval ARGS="--model <id> --price-in <usd/MTok> --price-out <usd/MTok>"
  make eval ARGS="--model <id> --price-in ... --price-out ... --no-repair"
then:
  cd agent && uv run python ../eval/ablation.py [--date 2026-11-02]

Writes eval/reports/<date>_ablation.md and .svg (never overwrites).
"""

import argparse
import json
import math
from datetime import date
from html import escape
from pathlib import Path
from typing import Any

REPORTS = Path(__file__).resolve().parent / "reports"

# Reference data-viz palette, categorical slots 1-2 (validated all-pairs, light + dark).
SERIES = {True: ("#2a78d6", "#3987e5"), False: ("#eb6834", "#d95926")}


def collect(reports_dir: Path, day: str | None) -> list[dict[str, Any]]:
    rows = []
    for path in sorted(reports_dir.glob("*.json")):
        if path.stem.endswith("ablation") or (day and not path.stem.startswith(day)):
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        meta, s = data["meta"], data["summary"]
        if meta.get("provider") in ("gold", "fake"):
            continue  # harness checks, not models
        rows.append(
            {
                "report": path.stem,
                "model": meta["model"],
                "repair": meta["repair"],
                "result": s["result_set_match"],
                "spec": s["spec_exact_match"],
                "cost": s.get("cost_usd_per_100_queries"),
                "latency": s["latency_ms"]["total_p50"],
                "invalid_sql": s["invalid_sql"],
            }
        )
    return rows


def table(rows: list[dict[str, Any]]) -> str:
    out = [
        "| model | repair | result-set match | spec match | USD / 100 queries | median latency | invalid SQL |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in sorted(rows, key=lambda r: (r["model"], not r["repair"])):
        cost = f"{r['cost']:.3f}" if r["cost"] is not None else "n/a"
        out.append(
            f"| {r['model']} | {'on' if r['repair'] else 'off'} | {r['result']:.1%} | "
            f"{r['spec']:.1%} | {cost} | {r['latency']:.0f} ms | {r['invalid_sql']} |"
        )
    return "\n".join(out)


def nice_step(span: float, target: int = 5) -> float:
    """A 1/2/2.5/5 x 10^k tick step giving about `target` ticks over span."""
    raw = span / target
    mag = 10 ** math.floor(math.log10(raw))
    return next(m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= raw)


def chart(rows: list[dict[str, Any]]) -> str:
    """Scatter: x = cost per 100 queries (or latency if no prices), y = result-set match."""
    use_cost = all(r["cost"] is not None for r in rows)
    xkey, xlabel = (
        ("cost", "USD per 100 queries") if use_cost else ("latency", "median latency (ms)")
    )
    w, h, pad_l, pad_r, pad_t, pad_b = 640, 400, 64, 130, 64, 56
    xs = [r[xkey] for r in rows] or [0.0, 1.0]
    step = nice_step(max(xs) or 1.0)
    xmin, xmax = 0.0, step * math.ceil((max(xs) or 1.0) / step)
    ymin = min(0.5, min((r["result"] for r in rows), default=0.5) - 0.05)
    sx = lambda v: pad_l + (v - xmin) / (xmax - xmin) * (w - pad_l - pad_r)  # noqa: E731
    sy = lambda v: h - pad_b - (v - ymin) / (1 - ymin) * (h - pad_t - pad_b)  # noqa: E731
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" font-family="system-ui, sans-serif" font-size="12" role="img" aria-label="Query accuracy versus {xlabel}">',
        "<style>",
        ".bg{fill:#fcfcfb}.ink{fill:#0b0b0b}.ink2{fill:#52514e}.grid{stroke:#e6e5e0}"
        ".s1{fill:#2a78d6}.s0{fill:#eb6834}.mark{stroke:#fcfcfb;stroke-width:2}",
        "@media (prefers-color-scheme: dark){.bg{fill:#1a1a19}.ink{fill:#f0efec}.ink2{fill:#c3c2b7}"
        ".grid{stroke:#33332f}.s1{fill:#3987e5}.s0{fill:#d95926}.mark{stroke:#1a1a19}}",
        "</style>",
        f'<rect class="bg" width="{w}" height="{h}"/>',
        f'<text class="ink" x="{pad_l}" y="24" font-size="15" font-weight="600">Query accuracy vs {escape(xlabel)}</text>',
    ]
    for i in range(6):  # recessive y grid at 10% steps from ymin
        v = ymin + (1 - ymin) * i / 5
        parts.append(
            f'<line class="grid" x1="{pad_l}" x2="{w - pad_r}" y1="{sy(v):.1f}" y2="{sy(v):.1f}"/>'
        )
        parts.append(
            f'<text class="ink2" x="{pad_l - 8}" y="{sy(v) + 4:.1f}" text-anchor="end">{v:.0%}</text>'
        )
    for i in range(round((xmax - xmin) / step) + 1):
        v = xmin + i * step
        label = f"{v:g}" if use_cost else f"{v:.0f}"
        parts.append(
            f'<text class="ink2" x="{sx(v):.1f}" y="{h - pad_b + 18}" text-anchor="middle">{label}</text>'
        )
    parts.append(
        f'<text class="ink2" x="{(pad_l + w - pad_r) / 2}" y="{h - 14}" text-anchor="middle">{escape(xlabel)}</text>'
    )
    parts.append(
        f'<text class="ink2" x="16" y="{(pad_t + h - pad_b) / 2}" transform="rotate(-90 16 {(pad_t + h - pad_b) / 2})" text-anchor="middle">result-set match</text>'
    )
    for r in rows:
        x, y = sx(r[xkey]), sy(r["result"])
        tip = f"{r['model']} · repair {'on' if r['repair'] else 'off'} · {r['result']:.1%} · {r['latency']:.0f} ms"
        parts.append(
            f'<g><title>{escape(tip)}</title><circle class="mark s{int(r["repair"])}" cx="{x:.1f}" cy="{y:.1f}" r="6"/>'
            f'<text class="ink" x="{x + 10:.1f}" y="{y + 4:.1f}">{escape(r["model"])}</text></g>'
        )
    lx = pad_l
    for repair, name in ((True, "repair on"), (False, "repair off")):
        parts.append(f'<circle class="s{int(repair)}" cx="{lx + 6}" cy="42" r="6"/>')
        parts.append(f'<text class="ink" x="{lx + 18}" y="46">{name}</text>')
        lx += 110
    parts.append("</svg>")
    return "\n".join(parts)


def write(rows: list[dict[str, Any]], reports_dir: Path, day: str) -> Path:
    stem, n = f"{day}_ablation", 1
    while (reports_dir / f"{stem}.md").exists():
        n += 1
        stem = f"{day}_ablation-{n}"
    (reports_dir / f"{stem}.svg").write_text(chart(rows) + "\n", encoding="utf-8")
    md = [
        f"# Ablation ({day})",
        "",
        "Repair loop on/off across model tiers, 100-utterance set (`eval/utterances.jsonl`).",
        "",
        table(rows),
        "",
        f"![accuracy vs cost]({stem}.svg)",
    ]
    (reports_dir / f"{stem}.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return reports_dir / f"{stem}.md"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--date", help="only reports from this day (YYYY-MM-DD)")
    args = ap.parse_args()
    rows = collect(REPORTS, args.date)
    if not rows:
        raise SystemExit("no model reports found; run `make eval` for each configuration first")
    print(write(rows, REPORTS, args.date or date.today().isoformat()))


if __name__ == "__main__":
    main()
