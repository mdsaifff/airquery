---
paths:
  - "web/**"
---

# Frontend rules (web/)

- three.js: one `BufferGeometry` + `Points` per dataset. Update attributes in
  place (`needsUpdate = true`); never rebuild meshes per query. Dispose
  geometries, materials and textures when a scene is torn down.
- Animate filter changes by tweening a per-point `visibility`/`alpha`
  attribute in the shader or material, not by adding and removing points.
- MediaPipe: create the recognizer once, load the model from the official
  CDN path or `web/public/models/`, and call it from a single
  `requestVideoFrameCallback`/`requestAnimationFrame` loop. Handle the case
  where the camera permission is denied with a visible message and mouse mode.
- DuckDB-Wasm: initialize once in a worker; use prepared statements with the
  `params` from the agent; never build SQL strings in the frontend.
- Validate every agent response with zod before using it.
- React is for HUD panels only. Don't put per-frame data in React state; push
  it through refs or a small store that the HUD polls at ~10 Hz.
- Every tunable number goes in `src/config.ts` with its unit in a comment.
- Keyboard fallbacks: space = push-to-talk, `R` = reset view, `Z` = undo,
  `D` = toggle debug panel (dev only).
