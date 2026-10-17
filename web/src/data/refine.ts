// Pure: the spec for a UI action (a chart click) built from what is on screen.
// The agent still validates and compiles it (POST /compile); no SQL is made here.
import type { QuerySpec } from '../contracts/contracts.ts';

export type SpecFilter = QuerySpec['filters'][number];

export function blankSpec(dataset: string): QuerySpec {
  return {
    version: 1,
    dataset,
    intent: 'query',
    mode: 'replace',
    filters: [],
    color_by: null,
    size_by: null,
    sort: null,
    limit: null,
    camera_target: null,
  };
}

/** What is on screen plus `filter`, replacing any filter on the same field. */
export function refine(current: QuerySpec | null, dataset: string, filter: SpecFilter): QuerySpec {
  const base = current ?? blankSpec(dataset);
  return {
    ...base,
    intent: 'query',
    mode: 'replace',
    camera_target: null,
    filters: [...base.filters.filter((f) => f.field !== filter.field), filter],
  };
}
