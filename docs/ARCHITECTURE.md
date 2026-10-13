# AirQuery — Architecture and contracts

Two loops share one scene. The **hand loop** runs entirely in the browser,
every frame. The **voice loop** makes one round trip to the Python agent,
which returns a validated spec + SQL that DuckDB-Wasm runs locally.

```
BROWSER (laptop, no GPU)
  Webcam ─► Hand tracking ─► Gesture rules ─► State machine ──camera events──┐
            (MediaPipe)      (smooth+classify) (rotate/zoom/listen)          ▼
  Mic ─► Speech-to-text ──utterance + current spec──┐              three.js scene ◄── result rows ── DuckDB-Wasm
                                                     │                                                   ▲
AGENT (Python service)                               ▼                                                   │
  LLM API ◄─► Parse (LLM fills QuerySpec) ─► Validate (Pydantic) ─valid─► Compile (spec → SQL) ─spec+SQL─┘
                      ▲                         │ invalid
                      └──── retry (max 2) ── Repair or clarify
```

The glass box and transcript render from the same spec the scene uses.

## Components

| Path | Responsibility | Pure? |
| --- | --- | --- |
| `web/src/tracking/` | MediaPipe wrapper, coordinate conversion, One Euro filter, hand geometry | geometry + filter: yes |
| `web/src/interaction/` | Gesture classifier, state machine, camera controller | classifier + state machine: yes |
| `web/src/voice/` | `SpeechToText` interface, Web Speech impl, typed fallback, push-to-talk | interface: yes |
| `web/src/data/` | DuckDB-Wasm worker, query runner, Arrow → typed arrays | no |
| `web/src/scene/` | three.js scene manager, globe scene, (later) galaxy scene, picking | no |
| `web/src/hud/` | React HUD: glass box, transcript, latency, toasts, debug panel | no |
| `web/src/contracts/` | Generated TS types from the agent's JSON Schema | generated |
| `web/src/config.ts` | All tunable constants with units | — |
| `agent/spec.py` | `QuerySpec` + related Pydantic models | yes |
| `agent/schema_registry.py` | Loads `DatasetSchema` files; column/op whitelists | yes |
| `agent/merge.py` | Applies a `refine` spec to the previous spec | yes |
| `agent/compile_sql.py` | Spec → parameterized DuckDB SQL | yes |
| `agent/llm.py` | `LLMAdapter` protocol, provider impl, `MockLLM` | adapter: yes |
| `agent/graph.py` | LangGraph: parse → validate → repair/clarify → compile | — |
| `agent/main.py` | FastAPI app, CORS, rate limit, cache, JSONL logging | no |
| `data_prep/` | Download, clean, write Parquet + `DatasetSchema` JSON | — |
| `eval/` | Test utterances, gold specs, scoring, reports | — |

## Allowed dependencies

Ask the user before adding anything not listed here.

- **web:** `react`, `react-dom`, `three`, `@mediapipe/tasks-vision`,
  `@duckdb/duckdb-wasm`, `apache-arrow` (if needed by duckdb-wasm), `zod`
  (runtime validation of agent responses); dev: `vite`, `typescript`,
  `vitest`, `eslint`, `prettier`, `json-schema-to-typescript`.
- **agent:** `fastapi`, `uvicorn`, `pydantic`, `pydantic-settings`,
  `langgraph`, `httpx`, one LLM provider SDK (chosen by the user, see T3.4);
  dev: `pytest`, `ruff`.
- **data_prep:** `pandas` or `duckdb` (Python), `pyarrow`, `requests`;
  stretch only: `sentence-transformers`, `umap-learn`.

## Data files

`make data` writes, for each dataset `<ds>`:

- `web/public/data/<ds>.parquet`
- `web/public/data/<ds>.schema.json` (a `DatasetSchema`)

The agent reads schema files from `SCHEMA_DIR` (default
`../web/public/data`). Deployment copies them into the agent image.

### `quakes` columns

| Column | Type | Unit / note |
| --- | --- | --- |
| `id` | VARCHAR | USGS event id |
| `time` | TIMESTAMP | UTC |
| `lat` | DOUBLE | degrees |
| `lon` | DOUBLE | degrees |
| `depth_km` | DOUBLE | km below surface |
| `magnitude` | DOUBLE | as reported |
| `mag_type` | VARCHAR | e.g. mb, mww |
| `place` | VARCHAR | USGS place string |

### `DatasetSchema`

```json
{
  "dataset": "quakes",
  "table": "quakes",
  "description": "Earthquakes worldwide, one year, from the USGS catalog",
  "position": {"kind": "geo", "lat": "lat", "lon": "lon", "depth": "depth_km"},
  "columns": [
    {"name": "depth_km", "type": "number", "unit": "km", "min": -3.0, "max": 700.0,
     "synonyms": ["depth", "deep", "shallow"]},
    {"name": "place", "type": "text", "examples": ["Japan", "Chile", "Alaska"]}
  ],
  "default_color_by": "depth_km"
}
```

`min`/`max` are computed by data_prep; `synonyms` and `examples` help the LLM.
A text column with `"categorical": true` (all values listed in `examples`) can
drive colour; the first three values get palette slots, the rest fold to grey.

`position` is either `{"kind": "geo", "lat", "lon", "depth"?}` or, for data
already laid out in 3D (the paper galaxy's UMAP), `{"kind": "xyz", "x", "y", "z"}`.
`default_size_by` names the column sizing points when the spec sets none.

## Contract: `QuerySpec` (source of truth: `agent/spec.py`)

```python
from typing import Literal
from pydantic import BaseModel, Field

Op = Literal["=", "!=", ">", ">=", "<", "<=", "between", "in", "contains", "last_days"]

class Filter(BaseModel):
    field: str
    op: Op
    value: float | int | str | list[float | int | str]

class Sort(BaseModel):
    field: str
    direction: Literal["asc", "desc"] = "desc"

class CameraTarget(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    label: str

class QuerySpec(BaseModel):
    version: Literal[1] = 1
    dataset: str
    intent: Literal["query", "navigate", "undo", "reset", "explain"] = "query"
    mode: Literal["refine", "replace"] = "refine"
    filters: list[Filter] = []
    color_by: str | None = None
    size_by: str | None = None
    sort: Sort | None = None
    limit: int | None = Field(default=None, ge=1, le=5000)
    camera_target: CameraTarget | None = None
```

Validation (in addition to Pydantic types), against the `DatasetSchema`:
every `field`, `color_by`, `size_by`, `sort.field` must be a known column;
operators must fit the column type (`contains` only on text, `last_days` only
on timestamps, `between` needs a 2-element list); numeric values must sit
within the column's `[min, max]` widened by 50%.

### Refine merge rules (`agent/merge.py`, deterministic)
- `mode: replace` → the new spec is used as is.
- `mode: refine` → start from the previous spec; a new filter on a field
  replaces existing filters on that same field; other filters are kept;
  `color_by`, `size_by`, `sort`, `limit` are overwritten only when set.
- `intent: undo | reset` is handled by the frontend's history stack; the
  agent just returns the intent.

## Contract: agent HTTP API

`POST /query`

```json
// request
{ "dataset": "quakes", "utterance": "only deeper than 300 km",
  "current_spec": { ...QuerySpec or null... } }

// response
{ "status": "ok",            // "ok" | "clarify" | "rejected"
  "spec": { ...merged QuerySpec... },
  "sql": "SELECT id, lat, lon, depth_km, magnitude, time, place FROM quakes WHERE depth_km > ?",
  "params": [300],
  "message": null,          // clarifying question or rejection reason
  "retries": 0,
  "timings_ms": { "llm": 640, "validate": 2, "compile": 1, "total": 655 } }
```

`GET /health` → `{"ok": true}`.

The frontend validates every response with zod and runs `sql` with `params`
through a DuckDB prepared statement. The SELECT list always includes `id`,
the position columns, and any encoding columns.

## Contract: gesture events (`web/src/interaction/types.ts`)

```ts
type Hand = 'left' | 'right';
type GestureEvent =
  | { kind: 'cursor'; x: number; y: number }                  // screen px
  | { kind: 'pinchStart' | 'pinchMove' | 'pinchEnd'; hand: Hand; x: number; y: number }
  | { kind: 'twoHandZoom'; scaleDelta: number }                // ratio vs. previous frame
  | { kind: 'holdProgress'; gesture: HoldGesture; progress: number } // 0..1
  | { kind: 'fire'; gesture: HoldGesture }
  | { kind: 'clutch'; active: boolean }
  | { kind: 'talk'; active: boolean }
  | { kind: 'swipe'; direction: 'left' | 'right' }               // switch scene (stretch)
  | { kind: 'lasso'; active: boolean }                           // 🤟 held: air lasso (stretch)
  | { kind: 'handsLost' };
type HoldGesture = 'reset' | 'undo' | 'explain'; // explain: custom Model Maker gesture (stretch)
```

## Interaction state machine

States: `idle`, `pointing`, `rotating`, `zooming`, `clutched`, `listening`,
`lassoing` (stretch).

| From | Event | To | Side effect |
| --- | --- | --- | --- |
| idle | cursor | pointing | show cursor |
| pointing | pinchStart (one hand) | rotating | begin drag |
| rotating | pinchMove | rotating | rotate camera by delta |
| rotating | pinchEnd | pointing | release with damping |
| pointing / rotating | second hand pinches | zooming | begin zoom |
| zooming | twoHandZoom | zooming | dolly camera |
| zooming | either pinch ends | pointing | — |
| any except listening | clutch active | clutched | freeze camera |
| clutched | clutch inactive | pointing | — |
| pointing / idle | talk active | listening | start STT |
| listening | talk inactive | pointing | stop STT, send utterance |
| pointing | fire reset / undo | pointing | reset view / pop history |
| pointing | fire explain | pointing | "what's this?" (custom gesture, stretch) |
| pointing / idle | swipe | (same) | switch scene (left = next) |
| pointing | lasso active | lassoing | start loop |
| lassoing | cursor | lassoing | add loop point |
| lassoing | lasso inactive | pointing | select points inside the loop |
| any | handsLost (> 500 ms) | idle | hide cursor, stop drag |

The state machine is a pure reducer: `(state, event) => [state, effects[]]`.

## Coordinates

- MediaPipe → screen: `x_screen = (1 - x_norm) * width` (mirror),
  `y_screen = y_norm * height`. Done once in `src/tracking/`.
- Geo → 3D: radius `r = R * (1 - depth_km / 6371 * DEPTH_EXAGGERATION)`,
  then standard spherical conversion with `R = 1` scene unit.
  `DEPTH_EXAGGERATION` lives in `config.ts` (start around 3).

## Latency budget (target, voice path)

| Stage | Budget |
| --- | --- |
| End of speech → final transcript | ≤ 300 ms |
| Network + LLM parse | ≤ 900 ms |
| Validate + compile | ≤ 20 ms |
| DuckDB query | ≤ 50 ms |
| Buffer update + first changed frame | ≤ 50 ms |
| **Total** | **≤ 1.5 s median** |

## Query log line (`agent/logs/queries.jsonl`)

```json
{"ts": "2026-11-02T10:15:00Z", "dataset": "quakes", "utterance": "...",
 "prev_spec": {}, "spec": {}, "status": "ok", "errors": [], "retries": 0,
 "timings_ms": {"llm": 640, "validate": 2, "compile": 1, "total": 655},
 "cache_hit": false}
```
