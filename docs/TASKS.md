# AirQuery — Task list

Work top to bottom. One task per session or branch is ideal; run `/clear`
between tasks. A phase is done only when its **Gate** is met.

Format: each task has **Do** (what to build), **Done when** (acceptance
criteria Claude can check), and sometimes **Needs you** (checks only the
human can do: camera, microphone, feel, API keys, recording).

Current phase: **3**

---

## Phase 0 — Project setup

- [x] **T0.1 Scaffold the monorepo**
  - Do: create `web/` (Vite + React + TypeScript, strict), `agent/`
    (uv project, Python 3.12, FastAPI app with `GET /health`), `data_prep/`,
    `eval/`, root `Makefile` (`dev`, `test`, `lint`, `data`, `eval` targets;
    stub the ones without code yet), `.gitignore`, `agent/.env.example`,
    `README.md` stub. Refs: CLAUDE.md "Repo layout".
  - Done when: `make dev` serves the Vite page and `/health` returns
    `{"ok": true}`; `make test` runs one passing test in each Python package
    and one in `web/`.
- [x] **T0.2 Lint and format tooling**
  - Do: ESLint + Prettier + `tsc --noEmit` for web; ruff for Python;
    wire into `make lint`.
  - Done when: `make lint` passes on a clean tree and fails on a planted error.
- [x] **T0.3 CI**
  - Do: GitHub Actions workflow running `make lint` and `make test` on
    push and pull requests (Node LTS, Python 3.12, uv).
  - Done when: workflow file exists and runs locally with `act` or is
    verified green after the user pushes.
  - Needs you: create the GitHub repo and push.
  - Note: workflow written; not yet run (pending push by the user).

**Gate 0:** `make dev`, `make lint`, `make test` all work from a fresh clone.

---

## Phase 1 — Foundations (prove the three risky pieces separately)

- [x] **T1.1 Earthquake data pipeline**
  - Do: `data_prep/quakes.py` downloads one year from the USGS FDSN API as
    CSV, month by month (20,000-event cap per query), into
    `data_prep/raw/` (gitignored); cleans to the `quakes` columns in
    ARCHITECTURE.md; writes `web/public/data/quakes.parquet` and
    `quakes.schema.json` (`DatasetSchema` with computed min/max).
    Magnitude threshold is a CLI flag (default 4.5). Add `make data`.
  - Done when: tests pass on a small saved CSV fixture (no network);
    running `make data` produces both files; row count and min/max printed.
  - Needs you: run `make data` once with network access.
  - Note: ran it here (2024, M4.5+: 6,397 rows, 265 KB). The small Parquet is committed so a fresh clone works. Schema adds `id` and `row_count` keys.
- [x] **T1.2 Hand tracking on screen**
  - Do: `src/tracking/handTracker.ts` wraps MediaPipe Gesture Recognizer
    (`LIVE_STREAM`, `numHands: 2`); webcam in a small corner canvas,
    mirrored, with the 21-point skeleton drawn; tracking FPS shown.
  - Done when: app builds; tracking module has no React imports; FPS
    counter wired.
  - Needs you: open the app, allow the camera, confirm the skeleton follows
    both hands and report the FPS you see.
  - Note: JS tasks-vision only has VIDEO mode (no LIVE_STREAM); runs in its own requestVideoFrameCallback loop, capped by `trackingMaxFps` (D-008). Camera check pending (user).
- [x] **T1.3 Landmark recorder and fixtures**
  - Do: dev-only hotkey (`R`) records 3 s of landmark results to a JSON
    download; loader for fixtures in tests.
  - Done when: a loader test reads a sample fixture.
  - Needs you: record fixtures for point, pinch, pinch-drag, two-hand pinch,
    fist, open palm, victory, thumb down, and "talking with hands" (no
    gesture). Save them to `web/tests/fixtures/`.
  - Note: hotkey is Shift+R (plain R is reset view). `web/tests/synthHand.ts` makes synthetic hands so gesture tests run before real fixtures exist. Recording real fixtures pending (user).
- [x] **T1.4 Globe scene**
  - Do: `src/scene/sceneManager.ts` (renderer, camera, resize, render loop)
    and `globeScene.ts`: faint sphere + quakes as `THREE.Points` placed at
    depth (formula in ARCHITECTURE.md), size by magnitude, colour by depth.
    Mouse orbit for now.
  - Done when: scene renders the Parquet data; one `BufferGeometry` for all
    points (no per-point objects); frame time shown in the HUD.
  - Needs you: confirm it looks right and report the frame rate.
  - Note: verified in headless Chrome (software GL): 6,397 points render with coastlines (Natural Earth 110m, added to `make data`) and graticule. Camera controller written in full here (damping, reset, fly-to) and reused by T2.5. Real frame-rate check pending (user).
- [x] **T1.5 DuckDB-Wasm in a worker**
  - Do: `src/data/db.ts` loads `quakes.parquet`, exposes
    `run(sql, params) → typed arrays`; a temporary button runs a hard-coded
    `depth_km > ?` filter and the scene updates.
  - Done when: query runs in the worker (UI stays responsive); converting
    results allocates typed arrays once per query.
  - Note: verified headless: the temp button runs `depth_km > ?` (300) via a prepared statement in the DuckDB worker: 314/6,397 shown, ~30 ms. Results become a visibility mask through an id->index map built once.

**Gate 1:** hands on screen, quakes on the globe, one parameterized query
changes the scene. Ask the user to record a 10-second clip for the teaser.

---

## Phase 2 — Hands

- [x] **T2.1 Hand geometry**
  - Do: pure functions in `src/tracking/geometry.ts`: mirror conversion,
    hand scale, normalized fingertip distances, pinch point.
  - Done when: unit tests cover mirroring and scale invariance.
- [x] **T2.2 One Euro filter + debug panel**
  - Do: pure `OneEuroFilter` class; dev-only debug panel with sliders for
    `minCutoff`, `beta`, pinch thresholds, hold frames (values from
    `config.ts`).
  - Done when: tests show reduced jitter on a noisy synthetic signal and low
    lag on a step.
  - Note: `HandSmoother` filters all 21 landmarks per hand; tests: >3x jitter cut on a still noisy signal, 90% of a 300 px step within 5 frames.
- [x] **T2.3 Gesture classifier**
  - Do: pure classifier combining built-in labels + pinch rule (hysteresis:
    enter < `PINCH_ENTER`, exit > `PINCH_EXIT`) + hold-frames debounce,
    emitting `GestureEvent`s (ARCHITECTURE.md).
  - Done when: replaying each fixture from T1.3 produces the expected event
    sequence; the "talking with hands" fixture produces no `fire`, `talk` or
    `pinchStart` events.
  - Note: verified on synthetic replays (point, pinch, drag, two-hand zoom, fist, palm, thumb down, victory, dropouts, talking). Extra guards: pinch needs index reach (fist looks like a pinch), holds restart if the palm drifts. Real fixtures get checked against `tests/fixtures/expected.json` once recorded.
- [x] **T2.4 Interaction state machine**
  - Do: pure reducer implementing the transition table in ARCHITECTURE.md.
  - Done when: a table-driven test covers every row of the table.
  - Note: every table row (with the 'any' and 'pointing / rotating' rows expanded) is a test case. Small additions: clutched->pointing emits `unfreeze`; listening returns to idle if push-to-talk began without hands.
- [x] **T2.5 Camera controller**
  - Do: rotate from pinch-drag deltas, dolly from `twoHandZoom`, damping on
    release, animated reset, fly-to for `camera_target`. Mouse orbit stays as
    fallback.
  - Done when: controller logic is unit tested with synthetic events.
  - Needs you: rotate and zoom by hand; rate smoothness 1–5 and note anything
    that feels laggy or jumpy.
  - Note: controller (from T1.4) now driven by gestures via state machine -> `effects.ts`; synthetic-event tests cover drag + damping, two-hand dolly, clutch, reset, fly-to. Mouse orbit unchanged. Smoothness rating pending (user).
- [x] **T2.6 Cursor, picking and feedback cues**
  - Do: screen cursor; raycast hover on points with tooltip (place,
    magnitude, depth, date); skeleton colour by state; hold ring for reset and
    undo; clutch indicator.
  - Done when: picking works with the mouse in a test page.
  - Needs you: confirm hover and cues work by hand.
  - Note: screen-space picking (pure, tested) instead of a raycaster; verified headless: mouse hover shows place/magnitude/depth/date. Cursor shows a clutch/listening label and the hold ring; skeleton colour follows the mode. Runtime split into loadGlobe/trackingLoop/hover modules. Hand check pending (user).
- [x] **T2.7 Performance pass**
  - Do: separate tracking and render loops; per-stage timings collected in a
    ring buffer; HUD shows tracking fps, render fps.
  - Done when: render loop never awaits tracking or DuckDB.
  - Note: ring buffers per stage (frame, inference, gestures, query, voiceToRender) in `hud/metrics.ts`; HUD shows render/tracking fps + inference/gesture medians. A test guards that the render loop has no async code. Headless software-GL inference is ~180 ms; real-laptop numbers pending (user).

**Gate 2:** run the gesture self-test from `docs/EVAL.md` (20 tries per
gesture). All gestures ≥ 90%, no false trigger in 2 minutes of talking.
Tune `config.ts` and repeat until met.

---

## Phase 3 — Voice and agent

- [x] **T3.1 QuerySpec contract**
  - Do: `agent/spec.py` exactly as in ARCHITECTURE.md; script exports JSON
    Schema; `json-schema-to-typescript` generates `web/src/contracts/`;
    contract test fails if generated types are stale.
  - Done when: `make test` includes the drift check.
  - Note: one schema file `web/src/contracts/contracts.schema.json` holds QuerySpec, QueryRequest/Response and DatasetSchema; `make contracts` regenerates. Drift checked on both sides (pytest: spec.py vs JSON; vitest: JSON vs TS).
- [x] **T3.2 Schema registry, validator and merge**
  - Do: `schema_registry.py` loads `*.schema.json`; validator enforces the
    rules in ARCHITECTURE.md; `merge.py` implements refine rules.
  - Done when: tests cover unknown fields, wrong operator for type,
    out-of-range values, and each merge rule.
  - Note: validator lives in `agent/validate.py` and returns repair-friendly messages. Filter values are strict (no bool->number coercion). Extra rules: color_by must be numeric/timestamp, size_by numeric, navigate needs camera_target. Merge never carries camera_target over.
- [x] **T3.3 SQL compiler**
  - Do: `compile_sql.py` turns a validated spec into DuckDB SQL with `?`
    params; identifiers only from the schema whitelist.
  - Done when: tests include injection attempts in values and field names
    (must be rejected or parameterized), `between`, `in`, `contains`,
    `last_days`, sort and limit.
  - Note: also smoke-run against the real Parquet in DuckDB (every operator executes; 'deeper than 300 km' = 314 rows, same as the browser). `contains` = ILIKE with escaped wildcards; LIMIT inlined from the validated int; compiler refuses unvalidated specs.
- [ ] **T3.4 LLM adapter**
  - Do: `LLMAdapter` protocol returning a `QuerySpec` via the provider's
    structured output or tool calling; `MockLLM` for tests; prompt built from
    `DatasetSchema`, current spec and 8–12 worked examples kept in
    `agent/prompts/`.
  - **Before coding: ask the user which LLM provider and model to use.**
  - Done when: unit tests pass with `MockLLM`; a manual script hits the real
    provider with 5 utterances and prints specs.
  - Needs you: put the API key in `agent/.env`.
  - Note: PARTIAL (box left open): `LLMAdapter` protocol, `MockLLM`, prompt builder (`prompt_builder.py`), `prompts/system.md` + 12 worked examples (validated against the real schema in tests), `scripts/try_llm.py`. Waiting on the user's provider/model choice; then add one adapter in `llm.make_llm` using that provider's official SDK.
- [x] **T3.5 LangGraph agent**
  - Do: `graph.py`: parse → validate → (repair, max 2 retries | clarify) →
    merge → compile. Clarify when the LLM signals ambiguity or repairs run out
    on an ambiguous field.
  - Done when: tests with `MockLLM` cover success, one repair, exhausted
    retries, and clarify paths.
  - Note: exhausted retries -> `rejected` (listing filterable fields) when errors say the dataset can't do it, else `clarify`. Invalid client `current_spec` is rejected before any LLM call. Provider exceptions -> `rejected`. Token usage tracked for the cost ablation.
- [x] **T3.6 `/query` endpoint**
  - Do: FastAPI route per the API contract; CORS for the web origin; simple
    per-IP rate limit; in-memory cache keyed by (utterance, current_spec);
    JSONL logging.
  - Done when: endpoint tests with `MockLLM`; log line matches the schema.
  - Note: `create_app()` factory for DI; LRU cache (256) keyed by dataset + normalized utterance + current_spec, rejections not cached; sliding-window per-IP limit (429 with a QueryResponse body); one JSONL line per call incl. 422/429, plus model + token usage.
- [x] **T3.7 Speech to text and push-to-talk**
  - Do: `SpeechToText` interface; Web Speech implementation with interim
    results; typed-input box fallback; push-to-talk via `talk` events and
    spacebar.
  - Done when: interface has a fake implementation used in tests.
  - Needs you: test in Chrome; say 5 commands and note any mis-transcriptions.
  - Note: verified headless: typed input submits; spacebar drives idle->listening->idle through the state machine. `FakeSpeechToText` drives the `VoiceController` tests. Dev-only `window.__airquery` handle for headless checks. Chrome mic test pending (user).
- [x] **T3.8 Wire voice to scene**
  - Do: send utterance + current spec, validate response with zod, run SQL in
    DuckDB, animate points out/in, update legend; history stack for undo and
    reset; handle `clarify` and `rejected` with toasts.
  - Done when: an end-to-end test with a mocked agent response updates the
    point buffer.
  - Note: `QuerySession` (history stack) + `applyView`; zod schemas carry compile-time equality checks against the generated types. E2E test drives mocked agent JSON through zod, session, fake DuckDB and a real GlobeScene buffer. Also verified in headless Chrome against `agent/scripts/fake_agent.py` (keyword MockLLM, dev only): filter -> refine colour -> Z undo -> clarify toast. Added `default_size_by` to DatasetSchema. Open palm/R reset the camera; spoken 'reset' clears queries too.
- [ ] **T3.9 HUD**
  - Do: glass box (spec as compact JSON + SQL), transcript strip, latency
    counter (voice-to-render), mic indicator, toasts. Clean layout for video.
  - Needs you: check readability at 1080p screen recording.
- [ ] **T3.10 Deploy**
  - Do: Dockerfile for the agent; static build for web; env-based agent URL;
    deployment notes in README. Suggest hosts; the user picks.
  - Done when: production build works locally against a local agent.
  - Needs you: create accounts, set secrets, deploy, share the URLs.

**Gate 3:** the MVP hero scene (beats 1–4 of `docs/PRD.md`) works end to end
on the deployed site. Ask the user to record the hero take.

---

## Phase 4 — Measure and launch

- [ ] **T4.1 Query evaluation set**
  - Do: draft 100 utterances with gold specs in `eval/utterances.jsonl`
    (filters, encodings, ranks, time, refine chains, typos, ambiguous ones);
    `eval/score.py` reports spec exact-match and result-set match.
  - Needs you: review and correct the gold specs; add 20 phrased your own way.
- [ ] **T4.2 Ablation**
  - Do: run the eval with and without repair, and across 2–3 model tiers;
    save a table + chart of accuracy vs. cost vs. latency to `eval/reports/`.
- [ ] **T4.3 Latency report**
  - Do: script summarizing `queries.jsonl` and frontend timings: median and
    p90 per stage.
- [ ] **T4.4 Gesture study harness**
  - Do: guided on-screen trial mode (prompts a gesture, records outcome),
    exports a confusion matrix CSV.
  - Needs you: run it with yourself and 4 other people.
- [ ] **T4.5 Mouse baseline mode**
  - Do: a toggle that swaps gestures/voice for mouse orbit + dropdown filters;
    task timer for the 5 study tasks in `docs/EVAL.md`.
- [ ] **T4.6 README**
  - Do: GIF at top, one-line pitch, architecture diagram, measured results,
    how to run, decision highlights from `docs/DECISIONS.md`.

**Gate 4:** README shows real numbers; launch post is published.

---

## Phase 5 — Stretch (one per week, each with its own clip)

- [ ] **T5.1 Paper galaxy** — data_prep for arXiv sample (embed on CPU,
  UMAP 3D), `galaxyScene.ts`, swipe to switch scenes, new `DatasetSchema`.
- [ ] **T5.2 "What's this?"** — selection summary via the agent (`explain`
  intent, aggregates computed in DuckDB, not by the LLM) + speechSynthesis.
- [ ] **T5.3 Air lasso** — trace a loop with the index finger to select points.
- [ ] **T5.4 Bring your own CSV** — drop a CSV, infer `DatasetSchema`, pick
  position columns.
- [ ] **T5.5 Custom gesture** — MediaPipe Model Maker notebook (Colab or
  Kaggle), export `.task`, load as custom classifier.
