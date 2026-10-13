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
