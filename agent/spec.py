"""The contract: QuerySpec, the /query API models and DatasetSchema.

Source of truth for both languages. TypeScript types in web/src/contracts/ are
generated from these (see scripts/export_schema.py); a test fails if they drift.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr

Op = Literal["=", "!=", ">", ">=", "<", "<=", "between", "in", "contains", "last_days"]
# Strict: no silent bool->int or number->str coercion of filter values.
Scalar = StrictInt | StrictFloat | StrictStr


class Contract(BaseModel):
    # Fields with defaults are always present in responses, so the generated TS
    # types mark them required.
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


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


class QuerySpec(Contract):
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


# --- HTTP API ---------------------------------------------------------------


class QueryRequest(Contract):
    dataset: str
    utterance: str = Field(min_length=1, max_length=500)
    current_spec: QuerySpec | None = None


class CompileRequest(Contract):
    """POST /compile: a spec built in the UI (mouse baseline) -> validated SQL, no LLM."""

    dataset: str
    spec: QuerySpec


class QueryResponse(Contract):
    status: Literal["ok", "clarify", "rejected"]
    spec: QuerySpec | None = None
    sql: str | None = None
    params: list[Scalar] = []
    message: str | None = None
    retries: int = 0
    timings_ms: dict[str, float] = {}


# --- Dataset schema (written by data_prep) ----------------------------------


class Column(Contract):
    name: str
    type: Literal["number", "text", "timestamp"]
    unit: str | None = None
    min: float | str | None = None
    max: float | str | None = None
    synonyms: list[str] = []
    examples: list[str] = []
    # Text with a handful of values (all listed in examples): can drive colour.
    categorical: bool = False


class GeoPosition(Contract):
    kind: Literal["geo"]
    lat: str
    lon: str
    depth: str | None = None


class XyzPosition(Contract):
    """Points already laid out in 3D (e.g. a UMAP of embeddings), scene units ~[-1, 1]."""

    kind: Literal["xyz"]
    x: str
    y: str
    z: str


class DatasetSchema(Contract):
    dataset: str
    table: str
    description: str
    id: str = "id"
    position: GeoPosition | XyzPosition = Field(discriminator="kind")
    columns: list[Column]
    default_color_by: str | None = None
    default_size_by: str | None = None
    row_count: int | None = None

    def column(self, name: str) -> Column | None:
        return next((c for c in self.columns if c.name == name), None)

    def position_columns(self) -> list[str]:
        p = self.position
        cols = [p.lat, p.lon, p.depth] if isinstance(p, GeoPosition) else [p.x, p.y, p.z]
        return [c for c in cols if c]


# Models exported to TypeScript, with the JSON Schema mode each is exported in.
# Specs/requests/responses always carry every field ("serialization"); dataset
# schema files may omit optional keys ("validation").
EXPORTED = {
    QuerySpec: "serialization",
    QueryRequest: "serialization",
    CompileRequest: "serialization",
    QueryResponse: "serialization",
    DatasetSchema: "validation",
}
