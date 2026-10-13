"""Gesture study report: merge per-participant confusion CSVs into one matrix + heatmap.

Inputs are the confusion-*.csv files exported from the study panel (press G in the app).
Usage: cd agent && uv run python ../eval/gesture_report.py confusion-*.csv
Writes eval/reports/<date>_gestures.{csv,svg,md} (never overwrites).
"""

import argparse
import csv
from datetime import date
from html import escape
from pathlib import Path

REPORTS = Path(__file__).resolve().parent / "reports"
# Reference data-viz sequential ramp (blue, steps 100..700).
RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]


def read_matrix(path: Path) -> tuple[list[str], dict[str, dict[str, int]]]:
    with path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    cols = [c for c in rows[0][1:] if c != "accuracy"]
    m = {r[0]: {c: int(v) for c, v in zip(cols, r[1:], strict=False)} for r in rows[1:] if r}
    return cols, m


def merge(paths: list[Path]) -> tuple[list[str], dict[str, dict[str, int]]]:
    cols: list[str] = []
    total: dict[str, dict[str, int]] = {}
    for p in paths:
        c, m = read_matrix(p)
        cols = cols or c
        for g, row in m.items():
            dst = total.setdefault(g, dict.fromkeys(cols, 0))
            for k, v in row.items():
                dst[k] = dst.get(k, 0) + v
    return cols, total


def accuracy(m: dict[str, dict[str, int]]) -> dict[str, float]:
    return {
        g: (row.get(g, 0) / n if (n := sum(row.values())) else float("nan")) for g, row in m.items()
    }


def ramp(share: float) -> str:
    return RAMP[min(len(RAMP) - 1, int(share * (len(RAMP) - 1) + 0.5))]


def heatmap(cols: list[str], m: dict[str, dict[str, int]]) -> str:
    cell, left, top = 52, 90, 70
    w, h = left + cell * len(cols) + 16, top + cell * len(m) + 40
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" font-family="system-ui, sans-serif" font-size="12" role="img" aria-label="Gesture confusion matrix">',
        "<style>.bg{fill:#fcfcfb}.ink{fill:#0b0b0b}.ink2{fill:#52514e}"
        "@media (prefers-color-scheme: dark){.bg{fill:#1a1a19}.ink{fill:#f0efec}.ink2{fill:#c3c2b7}}</style>",
        f'<rect class="bg" width="{w}" height="{h}"/>',
        f'<text class="ink" x="{left}" y="22" font-size="15" font-weight="600">Expected (rows) vs detected (columns)</text>',
    ]
    for j, c in enumerate(cols):
        out.append(
            f'<text class="ink2" x="{left + j * cell + cell / 2}" y="{top - 10}" text-anchor="middle">{escape(c)}</text>'
        )
    for i, (g, row) in enumerate(m.items()):
        n = sum(row.values()) or 1
        y = top + i * cell
        out.append(
            f'<text class="ink2" x="{left - 8}" y="{y + cell / 2 + 4}" text-anchor="end">{escape(g)}</text>'
        )
        for j, c in enumerate(cols):
            v, share = row.get(c, 0), row.get(c, 0) / n
            x = left + j * cell
            ink = "#ffffff" if share > 0.45 else "#0b0b0b"
            fill = ramp(share) if v else "none"
            out.append(
                f"<g><title>{escape(g)} → {escape(c)}: {v} ({share:.0%})</title>"
                f'<rect x="{x + 1}" y="{y + 1}" width="{cell - 2}" height="{cell - 2}" rx="4" fill="{fill}" stroke="#8884" />'
                + (
                    f'<text x="{x + cell / 2}" y="{y + cell / 2 + 4}" text-anchor="middle" fill="{ink}">{v}</text>'
                    if v
                    else ""
                )
                + "</g>"
            )
    out.append(
        f'<text class="ink2" x="{left}" y="{h - 12}">cell = trials; shade = share of the row</text>'
    )
    out.append("</svg>")
    return "\n".join(out)


def write(cols: list[str], m: dict[str, dict[str, int]], n_files: int) -> Path:
    REPORTS.mkdir(exist_ok=True)
    stem, k = f"{date.today().isoformat()}_gestures", 1
    while (REPORTS / f"{stem}.md").exists():
        k += 1
        stem = f"{date.today().isoformat()}_gestures-{k}"
    acc = accuracy(m)
    with (REPORTS / f"{stem}.csv").open("w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["expected\\detected", *cols, "accuracy"])
        for g, row in m.items():
            wr.writerow([g, *(row.get(c, 0) for c in cols), f"{acc[g]:.3f}"])
    (REPORTS / f"{stem}.svg").write_text(heatmap(cols, m) + "\n", encoding="utf-8")
    lines = [
        f"# Gesture study ({date.today().isoformat()})",
        "",
        f"{n_files} participant file(s).",
        "",
    ]
    lines += ["| gesture | trials | accuracy |", "| --- | --- | --- |"]
    lines += [f"| {g} | {sum(row.values())} | {acc[g]:.0%} |" for g, row in m.items()]
    lines += ["", f"![confusion matrix]({stem}.svg)"]
    (REPORTS / f"{stem}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return REPORTS / f"{stem}.md"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("files", nargs="+", type=Path)
    args = ap.parse_args()
    cols, m = merge(args.files)
    print(write(cols, m, len(args.files)))


if __name__ == "__main__":
    main()
