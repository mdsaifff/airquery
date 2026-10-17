"""The contract: QuerySpec, the /query API models and DatasetSchema.

Source of truth for both languages. TypeScript types in web/src/contracts/ are
generated from these (see scripts/export_schema.py); a test fails if they drift.
"""

from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictFloat,
    StrictInt,
    StrictStr,
    field_validator,
)

Op = Literal["=", "!=", ">", ">=", "<", "<=", "between", "in", "contains", "last_days"]
# Strict: no silent bool->int or number->str coercion of filter values.
Scalar = StrictInt | StrictFloat | StrictStr


class Contract(BaseModel):
    # Fields with defaults are always present in responses, so the generated TS
    # types mark them required.
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class SchemaModel(BaseModel):
    """Dataset schema models: files may omit optional keys, so defaults stay optional."""


class Filter(Contract):
    field: str
    op: Op
    value: Scalar | list[Scalar]


class Sort(Contract):
    field: str
    direction: Literal["asc", "desc"] = "desc"


class CameraTarget(Contract):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    label: str


class Timeline(Contract):
    """A time machine command: play / pause / stop the year replay, seek, or change speed."""

    action: Literal["play", "pause", "stop", "seek", "speed"]
    date: str | None = None  # ISO date, for seek
    speed: Literal["day", "week", "month"] | None = None  # playback speed per second


class ViewChange(Contract):
    """Display switches; set only what changes."""

    xray: bool | None = None
    stats: bool | None = None
    share: bool | None = None
    mute: bool | None = None


class Pointer(Contract):
    """The globe point under the user's hand or mouse when they spoke ("here")."""

    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class Scene(Contract):
    """A scene the browser can show (built-in or a user's CSV), for "switch to ..." requests."""

    name: str = Field(max_length=64)
    title: str = Field(max_length=80)


class QuerySpec(Contract):
    version: Literal[1] = 1
    dataset: str
    intent: Literal[
        "query", "navigate", "undo", "reset", "explain", "timeline", "view", "switch"
    ] = "query"
    mode: Literal["refine", "replace"] = "refine"
    filters: list[Filter] = []
    color_by: str | None = None
    size_by: str | None = None
    sort: Sort | None = None
    limit: int | None = Field(default=None, ge=1, le=5000)
    camera_target: CameraTarget | None = None
    timeline: Timeline | None = None
    view: ViewChange | None = None
    switch_to: str | None = None  # intent switch: the scene to show


# --- HTTP API ---------------------------------------------------------------


class QueryRequest(Contract):
    dataset: str
    utterance: str = Field(min_length=1, max_length=500)
    current_spec: QuerySpec | None = None
    # The globe point under the hand or mouse when the user spoke ("here"), if any.
    pointer: Pointer | None = None
    # Every scene the browser can show right now (for "switch to ..."), current one included.
    scenes: list[Scene] = Field(default=[], max_length=32)  # >20: a plain Scene[] in TS
    # Only for user-dropped CSVs (dataset "user_*"): the schema inferred in the browser.
    dataset_schema: "DatasetSchema | None" = None


class CompileRequest(Contract):
    """POST /compile: a spec built in the UI (mouse baseline) -> validated SQL, no LLM."""

    dataset: str
    spec: QuerySpec


class ExplainRequest(Contract):
    """POST /explain: ids of the selected points -> aggregate SQL (computed in DuckDB)."""

    dataset: str
    ids: list[str] = Field(min_length=1, max_length=5000)
    dataset_schema: "DatasetSchema | None" = None


class QueryResponse(Contract):
    status: Literal["ok", "clarify", "rejected"]
    spec: QuerySpec | None = None
    sql: str | None = None
    params: list[Scalar] = []
    message: str | None = None
    retries: int = 0
    timings_ms: dict[str, float] = {}


# --- Dataset schema (written by data_prep) ----------------------------------


class Column(SchemaModel):
    # Size caps matter for schemas inferred in the browser (bring-your-own CSV).
    name: str = Field(min_length=1, max_length=64)
    type: Literal["number", "text", "timestamp"]
    unit: str | None = None
    min: float | str | None = None
    max: float | str | None = None
    synonyms: list[str] = []
    examples: list[str] = []
    # Text with a handful of values (all listed in examples): can drive colour.
    categorical: bool = False

    @field_validator("synonyms", "examples")
    @classmethod
    def _short_lists(cls, v: list[str]) -> list[str]:
        if len(v) > 20 or any(len(s) > 80 for s in v):
            raise ValueError("at most 20 items of up to 80 characters")
        return v


class GeoPosition(SchemaModel):
    kind: Literal["geo"]
    lat: str
    lon: str
    depth: str | None = None
    # Optional column drawn as height above the surface (bring-your-own CSV).
    height: str | None = None


class XyzPosition(SchemaModel):
    """Points already laid out in 3D (e.g. a UMAP of embeddings), scene units ~[-1, 1]."""

    kind: Literal["xyz"]
    x: str
    y: str
    z: str


class DatasetSchema(SchemaModel):
    dataset: str
    table: str
    # Shown in the scene picker ("earthquake globe") and what one point is called, plural
    # ("earthquakes"); both fall back to the dataset name / "points".
    title: str | None = Field(default=None, max_length=80)
    noun: str | None = Field(default=None, max_length=40)
    description: str
    id: str = "id"
    position: GeoPosition | XyzPosition = Field(discriminator="kind")
    columns: list[Column] = Field(max_length=64)
    default_color_by: str | None = None
    default_size_by: str | None = None
    row_count: int | None = None

    def column(self, name: str) -> Column | None:
        return next((c for c in self.columns if c.name == name), None)

    def position_columns(self) -> list[str]:
        p = self.position
        if isinstance(p, GeoPosition):
            return [c for c in (p.lat, p.lon, p.depth, p.height) if c]
        return [p.x, p.y, p.z]


QueryRequest.model_rebuild()
ExplainRequest.model_rebuild()

# Models exported to TypeScript, with the JSON Schema mode each is exported in.
# One mode for all, so each model gets a single TS type (SchemaModel keeps
# dataset-schema defaults optional either way).
EXPORTED = {
    QuerySpec: "serialization",
    QueryRequest: "serialization",
    CompileRequest: "serialization",
    ExplainRequest: "serialization",
    QueryResponse: "serialization",
    DatasetSchema: "serialization",
}
