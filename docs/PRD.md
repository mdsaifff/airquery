# AirQuery — Product spec

## Pitch

Explore a 3D dataset with your hands and ask questions out loud. Hand
tracking moves the camera; voice becomes a validated query; the scene
re-renders in under a second. Runs in a browser on a normal laptop, no GPU.

## Why it exists

- Dashboards are flat: clusters and 3D structure hide in 2D views.
- Questions are gated by syntax (menus, SQL, DAX).
- Every question costs a context switch.

This is a showcase and interaction prototype, not a BI replacement. It proves
four skills in one project: real-time computer vision, LLM tool use with
guardrails, in-browser data engineering, and 3D visualization.

## The hero demo (what "done" looks like)

One unedited 60-second take. Screen layout: full-screen 3D scene, small webcam
window with the hand skeleton drawn on it, transcript strip, "glass box" panel
showing the exact spec and SQL that ran, FPS + latency counter.

1. 0–5 s: raise a hand; a cursor appears over a slowly spinning globe of a
   year of earthquakes, plotted at their real depth.
2. 5–15 s: pinch and drag to rotate; pinch with both hands and pull apart to
   zoom into the Pacific Ring of Fire.
3. 15–30 s: "only show quakes deeper than 300 kilometres" → transcript,
   glass box updates, points animate out.
4. 30–40 s: "colour them by magnitude" → colour ramp and legend update.
5. 40–50 s (stretch): point at a cluster, "what's this?" → one spoken sentence
   with count, mean depth and region.
6. 50–60 s (stretch): swipe to the ML-paper galaxy; "papers about diffusion
   models since 2023".

## Scope

### MVP (must ship before any stretch work)
- Earthquake globe from USGS data, loaded into DuckDB-Wasm
- Seven gestures (table below)
- Push-to-talk voice → QuerySpec → validation → SQL → re-render
- Refine mode: follow-ups modify the previous spec ("now only 2024")
- Undo and reset
- Glass box, transcript strip, FPS and latency counter
- Typed-input fallback for every voice feature
- Mouse fallback for every gesture feature
- Deployed: public frontend + backend agent

### Stretch (one at a time, after the hero video)
- ML-paper galaxy scene (arXiv metadata, embeddings → UMAP 3D)
- "What's this?" spoken selection summaries (browser speechSynthesis)
- Air-drawn lasso selection
- Bring-your-own CSV with automatic schema reading
- Custom gesture trained with MediaPipe Model Maker
- Wake word instead of push-to-talk

### Out of scope
- AR headsets, real holograms
- Training a hand-tracking model from scratch
- LLM-written free-form SQL
- Mobile layout, multi-user sessions, accounts

## Gestures

| Gesture | Action | Detection |
| --- | --- | --- |
| Point (index up) | Move cursor; hover shows tooltip | Built-in `Pointing_Up` + index tip (landmark 8) |
| Pinch and drag | Rotate scene | Rule: thumb tip (4) to index tip (8) distance / hand scale below enter threshold, with hysteresis |
| Two-hand pinch, pull apart / together | Zoom | Rule: change in distance between the two pinch midpoints |
| Victory sign, held | Push-to-talk (listen while held) | Built-in `Victory`; spacebar fallback |
| Thumb down | Undo last query | Built-in `Thumb_Down`, held ≥ N frames |
| Open palm, held 0.5 s | Reset view | Built-in `Open_Palm` + hold timer with visible ring |
| Closed fist | Clutch: freeze scene while repositioning hand | Built-in `Closed_Fist` |

Hand scale = distance from wrist (0) to middle-finger MCP (9).

## Voice intents

| Intent | Example | Effect |
| --- | --- | --- |
| Filter | "only quakes deeper than 300 kilometres" | Adds a filter |
| Encode | "colour them by magnitude" | Colour channel + legend |
| Rank | "show the ten strongest" | Sort + limit |
| Time | "just 2024", "the last 30 days" | Date filter |
| Refine | "now only near Japan" | Adds to previous spec |
| Navigate | "fly to Chile" | Camera target only |
| Explain (stretch) | "what's this?" | Summary of selection |
| Control | "undo", "reset" | Query history |

Ambiguous requests get a short clarifying question, never a guess.
Impossible requests get a toast listing what *is* filterable.

## Feedback cues
- Skeleton colour by state: idle, pinching, clutched, listening.
- Ring fills while any hold gesture is timing.
- Pulsing mic icon while listening; live transcript.
- Toast for clarifications and rejected queries.

## Datasets

| Scene | Source | Notes |
| --- | --- | --- |
| Earthquake globe (MVP) | USGS FDSN event API, https://earthquake.usgs.gov/fdsnws/event/1/ | CSV, month by month (20,000 events per query cap). Keep time, latitude, longitude, depth, mag, place. One year, M2.5+ or M4.5+ depending on point count vs. frame rate. |
| Paper galaxy (stretch) | arXiv metadata on Kaggle (Cornell-University/arxiv) | Filter cs.LG, cs.CL, cs.CV; sample ~20k; embed abstracts with sentence-transformers on CPU; UMAP to 3D. Show titles + links only; don't republish abstracts. |
| Bring your own (stretch) | User's CSV, e.g. Inside Airbnb listings | lat/lon as position, a numeric column as height |

## Success metrics (targets; adjust after first measurements)
- Tracking ≥ 25 fps, rendering 60 fps
- Median voice-to-render latency < 1.5 s
- Gesture accuracy ≥ 95% per gesture; < 1 false trigger per 5 min
- Query accuracy ≥ 90% result-set match on a 100-utterance test set
- Zero invalid SQL reaching DuckDB
