# Query eval: openai_gpt-oss-20b

2026-10-14 · model `openai/gpt-oss-20b` · repair on · 100 utterances

| metric | value |
| --- | --- |
| spec exact match | 90.0% |
| result-set match | 92.0% |
| clarify precision / recall | 0.50 / 1.00 |
| invalid SQL reaching DuckDB | 0 |
| latency p50 / p90 (agent total) | 12027 / 13184 ms |
| cost per 100 queries | n/a USD |

| category | n | spec | result |
| --- | --- | --- | --- |
| ambiguous | 5 | 100% | 100% |
| encoding | 15 | 100% | 100% |
| filter | 30 | 93% | 93% |
| noisy | 10 | 80% | 80% |
| rank | 10 | 90% | 90% |
| refine | 20 | 90% | 95% |
| time | 10 | 70% | 80% |

## Misses

- `f14` 'intermediate depth quakes' -> clarify: What depth range do you consider intermediate? For example, 70–300 km?
- `f30` 'strong shallow quakes, magnitude 6 plus and under 70 km deep' -> rejected: The language model is unavailable (BadRequestError).
- `r08` 'weakest 25' -> clarify: What does 'weakest 25' refer to? Do you want the 25 earthquakes with the lowest magnitude, or a magnitude threshold?
- `t07` 'first half of the year' -> {"dataset": "quakes", "filters": [{"field": "time", "op": "between", "value": ["2024-01-01", "2024-06-30"]}]}
- `t08` 'in December' -> {"dataset": "quakes", "filters": [{"field": "time", "op": "between", "value": ["2024-12-01", "2024-12-31"]}]}
- `c20` 'reset everything' -> {"dataset": "quakes", "mode": "replace"}
- `n03` 'show the tense strongest' -> clarify: Did you mean the ten strongest earthquakes? If so, I can filter for the top 10 by magnitude.
- `n06` 'magnitude 6 an above' -> clarify: Do you mean magnitude 6 and above?
