// GENERATED from agent/spec.py via contracts.schema.json. Do not edit.
// Regenerate with `make contracts`.

export interface AirQueryContracts {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "CameraTarget".
 */
export interface CameraTarget {
  lat: number;
  lon: number;
  label: string;
}
/**
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "Column".
 */
export interface Column {
  name: string;
  type: 'number' | 'text' | 'timestamp';
  unit?: string | null;
  min?: number | string | null;
  max?: number | string | null;
  synonyms?: string[];
  examples?: string[];
  categorical?: boolean;
}
/**
 * POST /compile: a spec built in the UI (mouse baseline) -> validated SQL, no LLM.
 *
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "CompileRequest".
 */
export interface CompileRequest {
  dataset: string;
  spec: QuerySpec;
}
/**
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "QuerySpec".
 */
export interface QuerySpec {
  version: 1;
  dataset: string;
  intent: 'query' | 'navigate' | 'undo' | 'reset' | 'explain' | 'timeline' | 'view' | 'switch';
  mode: 'refine' | 'replace';
  filters: Filter[];
  color_by: string | null;
  size_by: string | null;
  sort: Sort | null;
  limit: number | null;
  camera_target: CameraTarget | null;
  timeline: Timeline | null;
  view: ViewChange | null;
  switch_to: string | null;
}
/**
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "Filter".
 */
export interface Filter {
  field: string;
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'between' | 'in' | 'contains' | 'last_days';
  value: number | string | (number | string)[];
}
/**
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "Sort".
 */
export interface Sort {
  field: string;
  direction: 'asc' | 'desc';
}
/**
 * A time machine command: play / pause / stop the year replay, seek, or change speed.
 *
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "Timeline".
 */
export interface Timeline {
  action: 'play' | 'pause' | 'stop' | 'seek' | 'speed';
  date: string | null;
  speed: ('day' | 'week' | 'month') | null;
}
/**
 * Display switches; set only what changes.
 *
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "ViewChange".
 */
export interface ViewChange {
  xray: boolean | null;
  stats: boolean | null;
  share: boolean | null;
  mute: boolean | null;
}
/**
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "DatasetSchema".
 */
export interface DatasetSchema {
  dataset: string;
  table: string;
  description: string;
  id?: string;
  position: GeoPosition | XyzPosition;
  /**
   * @maxItems 64
   */
  columns: Column[];
  default_color_by?: string | null;
  default_size_by?: string | null;
  row_count?: number | null;
}
/**
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "GeoPosition".
 */
export interface GeoPosition {
  kind: 'geo';
  lat: string;
  lon: string;
  depth?: string | null;
  height?: string | null;
}
/**
 * Points already laid out in 3D (e.g. a UMAP of embeddings), scene units ~[-1, 1].
 *
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "XyzPosition".
 */
export interface XyzPosition {
  kind: 'xyz';
  x: string;
  y: string;
  z: string;
}
/**
 * POST /explain: ids of the selected points -> aggregate SQL (computed in DuckDB).
 *
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "ExplainRequest".
 */
export interface ExplainRequest {
  dataset: string;
  /**
   * @minItems 1
   * @maxItems 5000
   */
  ids: [string, ...string[]];
  dataset_schema: DatasetSchema | null;
}
/**
 * The globe point under the user's hand or mouse when they spoke ("here").
 *
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "Pointer".
 */
export interface Pointer {
  lat: number;
  lon: number;
}
/**
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "QueryRequest".
 */
export interface QueryRequest {
  dataset: string;
  utterance: string;
  current_spec: QuerySpec | null;
  pointer: Pointer | null;
  /**
   * @maxItems 32
   */
  scenes: Scene[];
  dataset_schema: DatasetSchema | null;
}
/**
 * A scene the browser can show (built-in or a user's CSV), for "switch to ..." requests.
 *
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "Scene".
 */
export interface Scene {
  name: string;
  title: string;
}
/**
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "QueryResponse".
 */
export interface QueryResponse {
  status: 'ok' | 'clarify' | 'rejected';
  spec: QuerySpec | null;
  sql: string | null;
  params: (number | string)[];
  message: string | null;
  retries: number;
  timings_ms: {
    [k: string]: number;
  };
}
