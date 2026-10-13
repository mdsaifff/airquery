# AirQuery

A browser app for exploring 3D datasets with hand gestures and voice.
Hands steer the camera (MediaPipe hand tracking). Voice becomes a typed
query spec (LLM via a LangGraph agent), which is validated, compiled to
SQL, and run locally in DuckDB-Wasm. The result re-renders in three.js.
It is a portfolio piece: the 60-second demo video and measured numbers
matter as much as the code.

Full spec: `docs/PRD.md`. Contracts and data flow: `docs/ARCHITECTURE.md`.
Work queue: `docs/TASKS.md`. Past choices: `docs/DECISIONS.md`.
Read the relevant one before starting work; don't load all of them by default.

## Repo layout

- `web/` — Vite + TypeScript + React frontend. three.js is used imperatively
  (no react-three-fiber). Subfolders: `src/tracking`, `src/interaction`,
  `src/voice`, `src/data`, `src/scene`, `src/hud`, `src/contracts`.
- `agent/` — Python 3.12 FastAPI + LangGraph query service, managed with `uv`.
- `data_prep/` — Python scripts that produce Parquet + schema files into
  `web/public/data/`.
- `eval/` — utterance test set, gold specs, scoring scripts and reports.
- `docs/` — product, architecture, tasks, decisions, evaluation.

## Commands

Root `Makefile` is the single entry point. Prefer it over ad-hoc commands.

- `make dev` — run web (Vite) and agent (uvicorn --reload) together
- `make test` — Vitest in `web/`, pytest in `agent/` and `data_prep/`
- `make lint` — ESLint + Prettier check + tsc --noEmit; ruff check + ruff format --check
- `make data` — run data_prep to (re)build Parquet and schema files
- `make eval` — run the query-accuracy evaluation against the agent

If a command above doesn't exist yet, the current task is probably the one
that creates it. Don't invent alternatives silently; add the Makefile target.

## Hard rules (never break these)

1. **The LLM never writes SQL.** It fills a `QuerySpec` (see
   `docs/ARCHITECTURE.md`). Only `agent/compile_sql.py` produces SQL, from a
   validated spec, with column and operator whitelists and bound parameters.
2. **No API keys in the browser.** Keys live in `agent/.env` only. The
   frontend talks to the agent over HTTP. Never commit `.env`.
3. **No webcam frames or audio leave the browser** except the transcript text
   sent to the agent. Hand tracking runs fully client-side.
4. **One contract, two languages.** `QuerySpec` is defined in Pydantic
   (`agent/spec.py`) and exported as JSON Schema; TypeScript types in
   `web/src/contracts/` are generated from that schema. A contract test fails
   if they drift. Change the Python model first, then regenerate.
5. **Rendering never waits on tracking or queries.** Tracking, the render loop
   and DuckDB (in its web worker) run independently.
6. **Pure logic stays pure.** Gesture math, filters, the state machine, the
   spec validator and SQL compiler are pure functions/classes with unit tests
   and no DOM, camera or network access.

## How to work on a task

1. Open `docs/TASKS.md`, take the first unchecked task in the current phase
   (or the one the user names). Read only the docs it references.
2. Restate the acceptance criteria in one or two lines, then plan. For
   anything touching more than ~3 files, show the plan before editing.
3. Implement in small steps. Write or update tests alongside the code.
4. Verify: run `make lint` and `make test`. For UI work, also run the app
   and describe what the user should see.
5. If the task has a **Needs you** line, stop and hand the user that checklist.
   You cannot see the webcam, hear the microphone, or judge how a gesture feels.
6. Tick the box in `docs/TASKS.md`, add a one-line note under the task if
   something changed, and commit (see Git below).
7. If you made a non-obvious choice, add an entry to `docs/DECISIONS.md`.

Never start the next phase until its gate in `docs/TASKS.md` is met.
Ask before adding a new dependency that isn't listed in `docs/ARCHITECTURE.md`.

## Conventions

### TypeScript (web/)
- Strict mode on. No `any`; use `unknown` and narrow.
- Named exports only. One module per concern; files under ~250 lines.
- Coordinates: MediaPipe gives normalized image coords (0..1). Convert once,
  in `src/tracking/`, into mirrored screen space. Nothing downstream should
  know about raw MediaPipe coordinates.
- All tunable numbers (thresholds, filter params, hold times) live in
  `src/config.ts` with a comment stating the unit.
- Tests: Vitest, colocated as `*.test.ts`. Landmark fixtures in
  `web/tests/fixtures/*.json`.

### Python (agent/, data_prep/, eval/)
- Type hints everywhere; Pydantic v2 models for all external data.
- ruff for lint and format. pytest for tests; no network in unit tests
  (LLM calls go through an adapter with a mock implementation).
- Config via environment variables read in one place (`agent/settings.py`).

### Logging and metrics
- Every voice query appends one JSON line to `agent/logs/queries.jsonl`:
  timestamp, utterance, previous spec, returned spec, validation errors,
  retries, latency_ms per stage. This file feeds `eval/`.
- The frontend measures frame time and voice-to-render latency with
  `performance.now()` and shows them in the HUD.

## Git

- Branch per task: `t<id>-short-name` (e.g. `t2.3-gesture-classifier`).
- Conventional commits: `feat(tracking): pinch hysteresis`.
- Commit only when `make lint` and `make test` pass.
- Never commit `.env`, `agent/logs/`, recorded webcam media, or large raw
  downloads (keep raw data under `data_prep/raw/`, which is gitignored).

## Things that trip people up here

- The webcam view is mirrored; a hand moving right must move the cursor right.
- MediaPipe's `LIVE_STREAM` mode delivers results asynchronously; never assume
  the latest result matches the current video frame.
- The USGS API caps a single query at 20,000 events: download month by month.
- The Web Speech API works reliably only in Chromium browsers; the typed-input
  fallback must always work.
- DuckDB-Wasm returns Arrow; convert to typed arrays once, not per point.
