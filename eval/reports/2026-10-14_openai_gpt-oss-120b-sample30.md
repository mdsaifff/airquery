# Query eval: openai_gpt-oss-120b-sample30

2026-10-14 · model `openai/gpt-oss-120b` · repair on · 30 utterances

| metric | value |
| --- | --- |
| spec exact match | 100.0% |
| result-set match | 100.0% |
| clarify precision / recall | 1.00 / 1.00 |
| invalid SQL reaching DuckDB | 0 |
| latency p50 / p90 (agent total) | 19001 / 20781 ms |
| cost per 100 queries | n/a USD |

| category | n | spec | result |
| --- | --- | --- | --- |
| ambiguous | 1 | 100% | 100% |
| encoding | 5 | 100% | 100% |
| filter | 9 | 100% | 100% |
| noisy | 3 | 100% | 100% |
| rank | 3 | 100% | 100% |
| refine | 6 | 100% | 100% |
| time | 3 | 100% | 100% |
