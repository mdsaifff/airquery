// Pure: turn a query result's ids into a per-point visibility mask.
import type { Columns } from './arrow.ts';

/** id -> point index, built once from the base load. */
export function indexIds(ids: readonly string[]): Map<string, number> {
  const map = new Map<string, number>();
  ids.forEach((id, i) => map.set(id, i));
  return map;
}

/** Writes 1 for every point whose id is in the result, 0 otherwise. Returns the count shown. */
export function maskFromResult(
  result: Columns,
  idColumn: string,
  index: Map<string, number>,
  mask: Uint8Array,
): number {
  mask.fill(0);
  const ids = result.strings.get(idColumn);
  if (!ids) throw new Error(`result has no "${idColumn}" column`);
  let shown = 0;
  for (const id of ids) {
    const i = index.get(id);
    if (i !== undefined && !mask[i]) {
      mask[i] = 1;
      shown++;
    }
  }
  return shown;
}
