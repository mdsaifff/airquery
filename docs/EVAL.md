# Evaluation protocol

Numbers turn the demo into a data science result. Report what you measure,
including where gestures lose.

## 1. Performance
- Session: 2 minutes of mixed use on the demo laptop, Chrome, plugged in.
- Report: tracking fps and render fps (median, 5th percentile); voice-to-render
  latency per stage (median, p90) from `agent/logs/queries.jsonl` plus
  frontend timings.

## 2. Gesture accuracy
- Harness: T4.4 guided trial mode.
- Protocol: 5 people × 7 gestures × 20 tries. Normal room light. Seated,
  ~60 cm from the camera.
- Report: confusion matrix (CSV + heatmap), per-gesture accuracy.
- False triggers: each person talks naturally with their hands for 5 minutes
  while a counter logs unintended `fire`, `talk` and `pinchStart` events.
- Phase 2 self-test (Gate 2): the author alone, 20 tries per gesture,
  2 minutes of talking.

## 3. Query accuracy
- Set: `eval/utterances.jsonl`, 111 items:
  `{"id", "utterance", "prev_spec", "gold_spec", "tags"}` (+ optional `"pointer"`).
  Mix: 30 filters, 15 encodings, 10 ranks, 10 time, 20 refine chains,
  10 noisy transcripts (speech errors, typos), 5 ambiguous (gold = clarify),
  and (D-019) 5 timeline (one is "go to Chile": a place stays navigate), 3 view and
  3 pointer ("here") items. Timeline and view
  items are scored on the intent and its fields (they run no SQL); compare
  per-category numbers with reports made before 2026-10-17, not totals.
- Metrics: spec exact match (after normalizing filter order); result-set
  match (same row ids from DuckDB); clarify precision/recall on the
  ambiguous items; invalid SQL reaching DuckDB (must be 0).
- Ablations: with vs. without repair loop; 2–3 model tiers. Plot accuracy vs.
  cost per 100 queries vs. median latency.

## 4. Hands vs. mouse study
- 5 people, each does 5 tasks in both modes (order counterbalanced):
  1. Find the deepest earthquake cluster and hover one point.
  2. Show only quakes deeper than 300 km.
  3. Colour by magnitude and show the 10 strongest.
  4. Zoom to Japan and filter to 2024 only.
  5. Undo the last change and reset the view.
- Record: completion time, errors, and the 10-question System Usability Scale
  per mode.
- Report honestly, including tasks where the mouse wins.
