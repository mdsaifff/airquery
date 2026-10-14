# Decision log

Short entries, newest at the bottom. Each: context, decision, why,
consequences. Add one whenever a choice isn't obvious from the code.
These double as material for LinkedIn posts.

---

## D-001 three.js instead of deck.gl
- **Context:** need a globe with points below the surface, and later an
  embedding galaxy, with full camera control driven by gestures.
- **Decision:** three.js, used imperatively.
- **Why:** deck.gl's GlobeView is still experimental and doesn't support
  camera pitch or bearing; one engine covers both scenes.
- **Consequences:** we write our own geo → 3D conversion and picking.

## D-002 The LLM fills a spec; it never writes SQL
- **Context:** natural-language queries over a local database.
- **Decision:** LLM output is a typed `QuerySpec`; deterministic code
  validates and compiles it to parameterized SQL.
- **Why:** prevents injection and hallucinated columns, makes failures
  explainable, makes evaluation precise (spec exact-match).
- **Consequences:** query expressiveness is limited to what the spec supports;
  extend the spec deliberately.

## D-003 DuckDB-Wasm in the browser
- **Decision:** query Parquet in a web worker with DuckDB-Wasm.
- **Why:** real SQL, millisecond queries, no data leaves the laptop, no
  database server to host.

## D-004 Speech-to-text behind an interface
- **Decision:** start with the Web Speech API, keep a `SpeechToText`
  interface plus typed fallback.
- **Why:** Web Speech is quickest to prototype but works reliably only in
  Chromium browsers and sends audio to Google's servers in Chrome; we may swap
  in a hosted Whisper-style API later.

## D-005 Python agent with LangGraph
- **Decision:** the LLM step runs in a small FastAPI + LangGraph service.
- **Why:** keeps the API key server-side; parse → validate → repair is a
  natural graph; builds the GenAI stack the author is learning.

## D-006 React only for the HUD
- **Decision:** React renders HUD panels; three.js owns its own render loop
  outside React.
- **Why:** keeps the 60 fps loop free of React re-renders; HUD stays easy to
  build.

## D-007 One fixed year (2024), processed Parquet committed
- **Context:** the demo and the study tasks mention "2024 only"; the agent and
  the static site both need the data.
- **Decision:** `make data` defaults to 2024, M4.5+ (~6.4k events). The
  ~0.3 MB Parquet + schema are committed; raw CSVs stay gitignored.
- **Why:** a fresh clone runs without network; 6k points keep 60 fps easy.
- **Consequences:** relative time ("last 30 days") is measured from the
  latest event in the data, not from today (see `compile_sql.py`).

## D-008 MediaPipe VIDEO mode in its own frame-callback loop
- **Context:** T1.2 asks for `LIVE_STREAM`, but the JS tasks-vision API only
  has `IMAGE` and `VIDEO` (synchronous `recognizeForVideo`).
- **Decision:** `VIDEO` mode called from a `requestVideoFrameCallback` loop,
  separate from the render `requestAnimationFrame` loop, capped at
  `config.trackingMaxFps`. Results are pushed to consumers by callback.
- **Why:** keeps the render loop free of tracking awaits with no worker
  plumbing; a worker (ImageBitmap transfer) is the upgrade if inference time
  starts costing render frames.
- **Consequences:** inference still shares the main thread; watch
  `inferenceMs` in the HUD.

## D-009 Keyword "fake agent" for UI work without an API key
- **Context:** the LLM provider is still undecided (T3.4), but the UI, CORS,
  zod validation, DuckDB and the scene all need an end-to-end check.
- **Decision:** `agent/scripts/fake_agent.py` runs the real FastAPI app and
  LangGraph pipeline with a regex `MockLLM`. Dev-only; never deployed.
- **Why:** everything except the model is exercised for real, so wiring bugs
  show up before any tokens are spent.
- **Consequences:** it understands a handful of phrasings; accuracy numbers must
  come from `make eval` against a real provider.

## D-010 Mouse baseline compiles through the agent (`POST /compile`)
- **Context:** the hands-vs-mouse study needs dropdown filters, but hard rule 1
  says only `compile_sql.py` produces SQL and the frontend never builds it.
- **Decision:** dropdowns build a `QuerySpec`; the agent's `/compile` endpoint
  validates and compiles it (no LLM). Same history/undo path as voice.
- **Why:** one SQL generator, one validator, so both study arms run identical
  queries; only the input method differs.
- **Consequences:** the baseline needs the agent running (but no API key).
  Replies are sequence-numbered so the latest request wins when dropdowns
  change faster than the round trip.

## D-011 Paper galaxy from the arXiv API, ML deps opt-in
- **Context:** the PRD names the Kaggle arXiv dump, which needs a Kaggle account;
  embeddings need torch, which is heavy for every install and CI run.
- **Decision:** `data_prep/papers.py` pages the public arXiv API (cs.LG/CL/CV,
  per quarter 2019-2025, 3 s between requests); `sentence-transformers` +
  `umap-learn` live in an opt-in `galaxy` dependency group (`make galaxy`).
  Only ids, titles, years and fields are written; abstracts stay in `raw/`.
- **Why:** no account needed, polite to the API, normal installs stay small.
- **Consequences:** ~17k papers rather than a random sample of the full dump
  (each quarter returns the most recent submissions of that quarter).

## D-012 Claude as the LLM, JSON via structured outputs
- **Context:** T3.4 needed one provider; the parse step sits inside a voice
  round trip with a ~900 ms budget, and repair needs the model's raw output.
- **Decision:** `ClaudeLLM` calls the Anthropic SDK (`claude-opus-5-5` by
  default, `LLM_MODEL` overrides) at effort `low`, with `output_config.format`
  set to `transform_schema(LLMOutput)`. The reply is returned as a raw dict;
  `validate.py` still checks it, so ranges the schema can't express (lat/lon,
  limit) go through the normal repair loop. The system prompt (schema + rules +
  examples) carries `cache_control`; supported models get server-side refusal
  fallbacks (`fallbacks: "default"`), and a refusal maps to `rejected`.
- **Why:** constrained decoding removes JSON-format failures without giving up
  the validator; low effort keeps latency down since thinking can't be turned
  off on Opus 5.5; caching cuts cost and latency on every repeat request.
- **Consequences:** latency vs. accuracy per tier is measured in T4.2 (Opus 5.5,
  Sonnet 5.5, Haiku 5.5). If Opus misses the latency budget, switch `LLM_MODEL`.

## D-013 Groq free tier as the default LLM provider
- **Context:** the user has no Claude API key and wants a free option.
- **Decision:** `GroqLLM` (official `groq` SDK) is the default
  (`LLM_PROVIDER=groq`, `openai/gpt-oss-120b`, `reasoning_effort: low`) in
  plain JSON mode (`response_format: json_object`), with no schema sent.
  `ClaudeLLM` (D-012) stays as a one-line switch.
- **Prompt trim:** the free tier allows 8k tokens/min per model. Strict
  json_schema mode added ~730 prompt tokens per call (measured), and Groq only
  checks the schema after generation (it 400'd on omitted defaulted fields),
  so it guaranteed nothing the validator doesn't. Also dropped 3 worked
  examples that repeated a rule word for word, and added one rule for
  dropping a single filter. Same 30-item eval sample (`--sample 30`): strict
  schema 30/30, 433 s, p50 19 s (rate-limited); JSON mode 29/30, 141 s, p50
  4.3 s. The miss (c09, removing one filter) is fixed by the new rule (3/3 on
  rerun).
- **Why:** free key, open-weight models, fast enough for the voice budget,
  and works from the deployed agent. Local Ollama was too slow on a 16 GB
  laptop without a GPU and doesn't work once deployed.
- **Consequences:** free-tier limits (8k tokens/min and 1k requests/day per
  model, likely ~200k tokens/day) cap eval runs: use `--sample` for A/B checks. The model-tier ablation compares
  gpt-oss-20b vs 120b (and Claude tiers if a key turns up).
