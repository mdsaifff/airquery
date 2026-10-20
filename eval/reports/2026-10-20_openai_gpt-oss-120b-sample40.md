# Query eval: openai_gpt-oss-120b-sample40

2026-10-20 · model `openai/gpt-oss-120b` · repair on · 40 utterances

| metric | value |
| --- | --- |
| spec exact match | 95.0% |
| result-set match | 97.5% |
| clarify precision / recall | 0.67 / 1.00 |
| invalid SQL reaching DuckDB | 0 |
| latency p50 / p90 (agent total) | 2836 / 16413 ms |
| cost per 100 queries | n/a USD |

| category | n | spec | result |
| --- | --- | --- | --- |
| ambiguous | 1 | 100% | 100% |
| encoding | 5 | 100% | 100% |
| filter | 11 | 100% | 100% |
| noisy | 4 | 75% | 75% |
| pointer | 1 | 100% | 100% |
| rank | 4 | 75% | 100% |
| refine | 7 | 100% | 100% |
| switch | 1 | 100% | 100% |
| time | 3 | 100% | 100% |
| timeline | 2 | 100% | 100% |
| view | 1 | 100% | 100% |

## Misses

- `n10` 'color by deaf' -> clarify: Did you mean to color by a specific column like magnitude or depth?
