# AirQuery — Task list

Work top to bottom. One task per session or branch is ideal; run `/clear`
between tasks. A phase is done only when its **Gate** is met.

Format: each task has **Do** (what to build), **Done when** (acceptance
criteria Claude can check), and sometimes **Needs you** (checks only the
human can do: camera, microphone, feel, API keys, recording).

Current phase: **5**

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
  - Note: controller (from T1.4) now driven by gestures via state machine -> `effects.ts`; synthetic-event tests cover drag + damping, two-hand dolly, clutch, reset, fly-to. Mouse orbit unchanged. User check 2026-10-15: hand rotate/zoom feel smooth; push-to-talk (space and victory) and undo work. Formal Gate 2 self-test still pending. User feedback 2026-10-16 (fixed): releasing a pinch flung the globe (hand release now stops it; `gesture.handReleaseFling`), the relaxed open hand after a pinch triggered reset (reset hold 0.5 s -> 1.2 s, ignored for 1.5 s after a pinch; `gesture.resetAfterPinchMs`), and the idle auto-spin drifted the globe under a pointing finger (paused while a hand or the mouse is over the scene).
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
- [x] **T3.4 LLM adapter**
  - Do: `LLMAdapter` protocol returning a `QuerySpec` via the provider's
    structured output or tool calling; `MockLLM` for tests; prompt built from
    `DatasetSchema`, current spec and 8–12 worked examples kept in
    `agent/prompts/`.
  - **Before coding: ask the user which LLM provider and model to use.**
  - Done when: unit tests pass with `MockLLM`; a manual script hits the real
    provider with 5 utterances and prints specs.
  - Needs you: put the API key in `agent/.env`.
  - Note: default provider is Groq's free tier (`GroqLLM`, `groq` SDK, `openai/gpt-oss-120b`, strict json_schema, reasoning_effort low; D-013); Claude stays available (`ClaudeLLM`, `LLM_PROVIDER=anthropic`; D-012). Both tested with fake clients. Real run (2026-10-14, gpt-oss-120b): all 5 `try_llm.py` utterances gave correct specs, 0.7-1.1 s when under the rate limit. Groq checks the schema after generation and 400s on omitted defaulted fields, so the adapter passes `failed_generation` to the validator instead. Free tier is 8k tokens/min per model; the strict schema cost ~730 tokens per call, so Groq now uses JSON mode with a trimmed prompt (~1.6k tokens/query, ~5 queries/min; D-013).
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
- [x] **T3.9 HUD**
  - Do: glass box (spec as compact JSON + SQL), transcript strip, latency
    counter (voice-to-render), mic indicator, toasts. Clean layout for video.
  - Needs you: check readability at 1080p screen recording.
  - Note: 1080p layout checked in a headless 1920x1080 screenshot: glass box (spec with filters as expressions, SQL, params, per-stage timings) top-left, stats with voice->render latency (last + median) top-right, legend + transcript bottom-left clear of the webcam, toasts top-centre. Readability check of a real recording pending (user).
- [x] **T3.10 Deploy**
  - Do: Dockerfile for the agent; static build for web; env-based agent URL;
    deployment notes in README. Suggest hosts; the user picks.
  - Done when: production build works locally against a local agent.
  - Needs you: create accounts, set secrets, deploy, share the URLs.
  - Note: agent Dockerfile (uv image, schema files baked in, `$PORT`), `.dockerignore` keeps `.env` out (checked in the image). `WEB_ORIGIN` takes a comma-separated list. Verified: production web build on vite preview (:4173) against the container (CORS + zod + rejection toast with no LLM configured) and against the fake agent (314 rows, glass box, latency). Hosts listed in README; accounts/secrets/deploy pending (user).

**Gate 3:** the MVP hero scene (beats 1–4 of `docs/PRD.md`) works end to end
on the deployed site. Ask the user to record the hero take.

---

## Phase 4 — Measure and launch

- [x] **T4.1 Query evaluation set**
  - Closed 2026-10-18: a personal project, not a study; the README no longer reports
    measurements. Scripts and reports stay in `eval/` (best run: 97/100, see T4.2).
  - Do: draft 100 utterances with gold specs in `eval/utterances.jsonl`
    (filters, encodings, ranks, time, refine chains, typos, ambiguous ones);
    `eval/score.py` reports spec exact-match and result-set match.
  - Needs you: review and correct the gold specs; add 20 phrased your own way.
  - Note: DRAFTED (box open until reviewed): `eval/utterances.jsonl` (100 items, EVAL.md mix; gold = merged spec or `gold_clarify`), `eval/score.py` (in-process pipeline; spec exact-match, result-set match in DuckDB, clarify P/R, invalid SQL, latency, tokens/cost; `--no-repair`, `--model`, `--llm gold|fake`), tests incl. a gold-oracle run that must score 100%. `make eval` + eval tests in `make test`. First real runs (Groq gpt-oss-120b, `--sample 30`, reports in `eval/reports/`): `sample30` = strict-schema prompt 30/30; `sample30-2` = trimmed JSON-mode prompt 29/30 (miss fixed afterwards, D-013). Needs: user review of gold specs + 20 own phrasings, then a full 100-item run.
- [x] **T4.2 Ablation**
  - Closed 2026-10-18 with T4.1.
  - Do: run the eval with and without repair, and across 2–3 model tiers;
    save a table + chart of accuracy vs. cost vs. latency to `eval/reports/`.
  - Note: first full run 2026-10-14, Groq gpt-oss-20b, trimmed prompt: 90/100 spec, 92/100 result, 0 invalid SQL, clarify precision 0.5 (over-asks), 873 s rate-limited (`eval/reports/2026-10-14_openai_gpt-oss-20b.*`). gpt-oss-120b full run 2026-10-15: 97/100 spec, 98/100 result, 0 invalid SQL, clarify P/R 0.8/0.8, p50 1.6 s, p90 12.8 s (rate limit), 549 s (`eval/reports/2026-10-15_openai_gpt-oss-120b.*`). `make ablation` -> `eval/reports/2026-10-15_ablation.*` (sample reports skipped). Repair fired 0 times in 200 queries, so a --no-repair run would match these numbers; skipped to save free-tier quota. Median latency is dominated by the free-tier rate limit (20b ran back to back), not model speed.
  - Earlier: PARTIAL (box open): `eval/ablation.py` + `make ablation` turn the per-config reports into a table and an accuracy-vs-cost SVG (latency in tooltips/table), tested on fixture reports. Running the configs (`make eval ARGS="--model X --price-in .. --price-out .."`, with and without `--no-repair`, 2-3 tiers) needs the LLM provider.
- [x] **T4.3 Latency report**
  - Do: script summarizing `queries.jsonl` and frontend timings: median and
    p90 per stage.
  - Note: `eval/latency.py` (+ `make latency`): agent log (cache misses only) + frontend timings exported with M (new stages: stt, agent round trip) -> median/p90 per stage vs the ARCHITECTURE budget. Real numbers pending a measured session on the demo laptop (user).
- [x] **T4.4 Gesture study harness**
  - Do: guided on-screen trial mode (prompts a gesture, records outcome),
    exports a confusion matrix CSV.
  - Needs you: run it with yourself and 4 other people.
  - Note: G opens the study panel: seeded shuffled trials (N per gesture), first discrete event wins, cursor-only = point, timeout = none; exports confusion + raw trial CSVs; includes the talking false-trigger counter (per 5 min). `make gestures ARGS="confusion-*.csv"` merges participants into CSV + SVG heatmap. Verified headless (prompt shown, timeout recorded). Sessions with 5 people pending (user).
- [x] **T4.5 Mouse baseline mode**
  - Do: a toggle that swaps gestures/voice for mouse orbit + dropdown filters;
    task timer for the 5 study tasks in `docs/EVAL.md`.
  - Note: B toggles the baseline (tracking + push-to-talk ignored, webcam/transcript hidden, dropdowns: depth, magnitude, place, time, colour, top N, undo, reset view); specs go through the new `POST /compile` (D-010). T opens the task timer (5 EVAL tasks, errors, gave-up, CSV) in either mode. Found and fixed a stale-reply race: `QuerySession` now drops replies to superseded requests. Verified headless.
- [x] **T4.6 README**
  - Done 2026-10-18: live link, author, MIT licence, this repo's real deploy; results
    table and study tools dropped (see T4.1). A demo GIF can still go in the top comment.
  - Do: GIF at top, one-line pitch, architecture diagram, measured results,
    how to run, decision highlights from `docs/DECISIONS.md`.
  - Note: DRAFTED (box open): pitch, Mermaid architecture diagram, results table (targets + how each number is produced; rows say pending until measured), run/controls, deploy, decision highlights. Needs: demo GIF at docs/media/demo.gif and real numbers from make eval / make latency / the gesture study.

**Gate 4:** README shows real numbers; launch post is published.

---

## Phase 5 — Stretch (one per week, each with its own clip)

- [ ] **T5.1 Paper galaxy** — data_prep for arXiv sample (embed on CPU,
  UMAP 3D), `galaxyScene.ts`, swipe to switch scenes, new `DatasetSchema`.
  - Note: CODE DONE, data pending (box open): `data_prep/papers.py` (arXiv API per quarter, MiniLM embeddings, UMAP 3D; tests with fake embed/reduce), DatasetSchema `xyz` position + `categorical` columns, PointCloud/globeDecor split, multi-dataset runtime (`datasets.ts`), swipe gesture + Arrow keys, categorical legend, paper tooltips, papers prompt examples. Verified headless with a temporary placeholder layout (deleted). The real `make galaxy` run was stopped by Claude Code for low system memory after 53/84 pages (cached); rerun when RAM allows (D-011).
- [x] **T5.2 "What's this?"** — selection summary via the agent (`explain`
  intent, aggregates computed in DuckDB, not by the LLM) + speechSynthesis.
  - Note: LLM only classifies `explain`; the frontend collects visible ids near the pointer (front side on globes), `POST /explain` -> `compile_explain` (schema-driven avg/min/max, mode of categorical/region) -> DuckDB -> deterministic sentence -> toast + speechSynthesis; SQL shown in the glass box. Verified headless: 'This cluster has 569 earthquakes, 216 km deep on average, up to magnitude 7.3, mostly near Vanuatu.' Voice: picks the most natural installed voice (neural "Natural", then Chrome's Google voices) instead of the robotic Windows default; V opens a picker that remembers the choice (user feedback 2026-10-15).
- [x] **T5.3 Air lasso** — trace a loop with the index finger to select points.
  - Note: hold 🤟 (built-in ILoveYou) and trace with the index finger; new `lassoing` state; Shift+drag is the mouse fallback. Pure point-in-polygon selection in screen space (front side only on globes); selection focuses the scene, feeds 'what's this?', Esc or a new query clears. Verified headless: lasso -> 413 selected (no rotation) -> summary of those 413 -> Esc restores. Feel check by hand pending (user).
- [x] **T5.4 Bring your own CSV** — drop a CSV, infer `DatasetSchema`, pick
  position columns.
  - Note: drop a CSV anywhere -> DuckDB read_csv_auto in the browser (cap `csvMaxRows`, adds `__id`) -> lat/lon guessed from names, user confirms + optional height column -> schema inferred in JS (types, min/max, examples, categorical) -> points on the globe (height rises above the surface), added to the swipe order. `/query` and `/explain` accept `dataset_schema` for `user_*` datasets (Pydantic-validated, size-capped; SQL still only from compile_sql and runs in the user's own browser). Verified headless: 400-row CSV mapped, shown, and the agent answered using its columns. Ceiling: city-scale data looks small on a whole-Earth globe; a local map projection is the upgrade.
- [ ] **T5.5 Custom gesture** — MediaPipe Model Maker notebook (Colab or
  Kaggle), export `.task`, load as custom classifier.
  - Note: CODE DONE, training pending (box open): `notebooks/custom_gesture.ipynb` (Colab: upload <label>.tar files, optional MediaPipe 'none' samples, Model Maker train/eval, export .task). In-app: C records labelled raw webcam frames into <label>.tar (tested ustar writer); the tracker loads `web/public/models/gesture_recognizer.task` when present (panel shows stock/custom); holding the custom label (`config.gesture.customExplainLabel`, default Rock) fires 'what's this?'. Model Maker replaces the stock classifier, so the notebook retrains the existing labels too. Needs: record frames, run the notebook, drop in the .task, re-run the gesture study.
- [x] **T5.6 Visual redesign** — realistic Earth, X-ray depth mode, glowing
  markers, shockwave rings, opening replay, mission-control HUD, info cards,
  "how to read this" legend, welcome overlay.
  - Note: spec `docs/superpowers/specs/2026-10-15-visual-redesign-design.md`, plan `docs/superpowers/plans/2026-10-15-visual-redesign.md` (D-014). Verified with headless screenshots (software GL). Fixed on the way: hover picked quakes hidden behind the globe; a StrictMode remount could leave a false "Data failed to load". Real fps on the demo laptop with tracking on: pending (user).
- [x] **T5.8 Playground release** — dashboard, time machine, share links, loading screen,
  AI limits, touch. (Suggestion chips and opt-in hands were built, then dropped: D-018.)
  - Note: spec `docs/superpowers/specs/2026-10-16-playground-design.md` (amended for the D-016 cinematic redesign), plan `docs/superpowers/plans/2026-10-17-playground.md` (D-017). Headless checks done (1080p and 360 px phone): loading → welcome, chips/bars/undo, time machine play/pause/seek, share link round trip, opt-in hands, pinch zoom. Needs you: real phone check (touch, layout), real laptop check (playback smoothness, hands opt-in), deploy (README checklist).
- [x] **T5.9 Voice first** — voice controls the replay, X-ray, stats, share and mute; point
  and speak ("what happened here?", "only around here", "fly here"); spoken + subtitled
  replies; display-only dashboard.
  - Note: spec `docs/superpowers/specs/2026-10-17-voice-first-design.md`, plan `docs/superpowers/plans/2026-10-17-voice-first.md` (D-019). Headless checks with the fake agent (play/pause/stop, X-ray, stats, here over Chile, no-pointer clarify, mute keeps subtitles). Real model (gpt-oss-120b): new timeline/view/pointer items plus fly-to items 13/13. Needs you: pointing then speaking on the webcam; voice and reply length.
- [x] **T5.10 Pick a dataset** — a scene picker in the masthead, an "Open a CSV" button
  next to it (drag-and-drop still works), and voice: "switch to the paper galaxy".
  - Note: Phase C of the any-dataset plan (D-020). `QuerySpec` gains intent `switch` +
    `switch_to`; the request carries `scenes` (name + title, current one included), which go
    in the user message, not the cached system prompt. Headless with the fake agent: CSV
    picked through the button, picker back to quakes, typed "switch to the cities" and back,
    unknown scene leaves the view alone. 4 new eval items (s01-s04) need a real-model run:
    `make eval ARGS="--ids s01,s02,s03,s04"`. Needs you: saying "switch to ..." on the mic.
- [x] **T5.11 Gesture rework** — talk by raising the other hand, "here" stays on the
  pointing fingertip; one open palm starts over; pinch and hold still to draw a selection
  circle, whose contents are said straight away; ✌, 👎 and 🤟 retired; undo is spoken.
  - Note: D-021. Pure, tested: classifier (pointing pose, two-hand talk, still-pinch
    circle, one-hand-only reset), state machine (`circling`, `startOver`), effects,
    `circlePolygon`, gesture study (undo → circle). Needs you: feel on the webcam
    (`circleHoldMs` 600, in the D debug panel). Hold-still-to-talk was tried (1.2 s, then
    2.5 s) and removed: it fired while reading quakes. Shared AI budget raised to 5/min.
- [x] **T5.12 More scenes** — hurricane tracks (replayable), meteorite landings, deep-sea
  corals (X-ray depth), airports (elevation as height) and a 3D star map, in the picker.
  - Note: one script, `data_prep/catalog.py` (part of `make data`), one cleaning query per
    scene; tests on inline fixtures. Schemas gained optional `title` / `noun`, so scenes name
    themselves (picker, count, spoken replies) instead of hardcoded maps (D-022). Built
    2026-10-17: 6.7k storm positions, 31.9k meteorites, 14.5k coral records (thinned from
    445k below 1,000 m), 72.6k airports, 15.2k stars; 5.2 MB of Parquet in all. Headless:
    every scene loads from the picker, hurricane replay runs, corals sink with X-ray. No
    worked examples or eval items for the new scenes yet: accuracy there is unmeasured.
  - Note: audit 2026-10-17 with a real-model probe (42 commands + refine chains). Fixed:
    case-sensitive names ("hurricane Milton" found 0), bare sorts ("the deepest ones"
    changed nothing; a sort now needs a limit, checked after the merge), "only X" dropping
    earlier filters, timelines on undated data, a switch without `dataset`, quake wording
    and depth bands on other scenes, 3-colour categories, linear scales for heavy-tailed
    data (D-023), and "in a minute" for Groq's daily cap. Chain probe cut short by that cap.
