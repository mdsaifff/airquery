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
