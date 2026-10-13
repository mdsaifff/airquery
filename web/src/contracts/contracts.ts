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
  intent: 'query' | 'navigate' | 'undo' | 'reset' | 'explain';
  mode: 'refine' | 'replace';
  filters: Filter[];
  color_by: string | null;
  size_by: string | null;
  sort: Sort | null;
  limit: number | null;
  camera_target: CameraTarget | null;
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
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "DatasetSchema".
 */
export interface DatasetSchema {
  dataset: string;
  table: string;
  description: string;
  id?: string;
  position: GeoPosition;
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
}
/**
 * This interface was referenced by `AirQueryContracts`'s JSON-Schema
 * via the `definition` "QueryRequest".
 */
export interface QueryRequest {
  dataset: string;
  utterance: string;
  current_spec: QuerySpec | null;
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
