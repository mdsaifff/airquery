# Query eval: openai_gpt-oss-120b-sample30

2026-10-14 · model `openai/gpt-oss-120b` · repair on · 30 utterances

| metric | value |
| --- | --- |
| spec exact match | 96.7% |
| result-set match | 96.7% |
| clarify precision / recall | 1.00 / 1.00 |
| invalid SQL reaching DuckDB | 0 |
| latency p50 / p90 (agent total) | 4328 / 11830 ms |
| cost per 100 queries | n/a USD |

| category | n | spec | result |
| --- | --- | --- | --- |
| ambiguous | 1 | 100% | 100% |
| encoding | 5 | 100% | 100% |
| filter | 9 | 100% | 100% |
| noisy | 3 | 100% | 100% |
| rank | 3 | 100% | 100% |
| refine | 6 | 83% | 83% |
| time | 3 | 100% | 100% |

## Misses

- `c09` 'forget Japan, keep the depth filter' -> {"dataset": "quakes", "filters": [{"field": "place", "op": "contains", "value": "Japan"}, {"field": "depth_km", "op": ">", "value": 300}]}
