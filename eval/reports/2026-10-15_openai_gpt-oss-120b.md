# Query eval: openai_gpt-oss-120b

2026-10-15 · model `openai/gpt-oss-120b` · repair on · 100 utterances

| metric | value |
| --- | --- |
| spec exact match | 97.0% |
| result-set match | 98.0% |
| clarify precision / recall | 0.80 / 0.80 |
| invalid SQL reaching DuckDB | 0 |
| latency p50 / p90 (agent total) | 1579 / 12758 ms |
| cost per 100 queries | n/a USD |

| category | n | spec | result |
| --- | --- | --- | --- |
| ambiguous | 5 | 80% | 80% |
| encoding | 15 | 100% | 100% |
| filter | 30 | 100% | 100% |
| noisy | 10 | 90% | 90% |
| rank | 10 | 90% | 100% |
| refine | 20 | 100% | 100% |
| time | 10 | 100% | 100% |

## Misses

- `n10` 'color by deaf' -> clarify: I didn't understand what you want to color by. You can color by numeric fields like magnitude, depth_km, or timestamp fields like time.
- `a02` 'just the recent ones' -> {"dataset": "quakes", "filters": [{"field": "time", "op": "last_days", "value": 30}]}
