---
paths:
  - "agent/**"
---

# Agent rules (agent/)

- The only module that produces SQL is `compile_sql.py`. Identifiers come
  from the schema whitelist; values are always bound parameters.
- The LLM is called only through `LLMAdapter`. Tests use `MockLLM` and never
  touch the network.
- Keep prompts in `agent/prompts/` as files, not inline strings. Worked
  examples there double as documentation; keep them in sync with
  `eval/utterances.jsonl` style.
- LangGraph state is a typed model (Pydantic or TypedDict) with explicit
  fields: utterance, prev_spec, candidate_spec, errors, retries, status.
- Cap repair retries at 2. On exhaustion return `status: "clarify"` or
  `"rejected"` with a human-readable `message`; never return an unvalidated
  spec.
- Settings come from `agent/settings.py` (pydantic-settings) reading
  `agent/.env`. Never log API keys or full prompts containing keys.
- Every `/query` call writes exactly one JSONL log line, including failures.
