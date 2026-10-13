// Pure: a dataset's rows -> scene positions, from its DatasetSchema position spec.
import type { DatasetSchema } from '../contracts/contracts.ts';
import { numbers } from '../data/arrow.ts';
import type { Columns } from '../data/arrow.ts';
import { geoToXYZ, radiusAtDepth } from './geo.ts';

export function positionsFor(
  schema: DatasetSchema,
  base: Columns,
  depthExaggeration: number,
): Float32Array {
  const out = new Float32Array(base.numRows * 3);
  const p = schema.position;
  if (p.kind === 'geo') {
    const lat = numbers(base, p.lat);
    const lon = numbers(base, p.lon);
    const depth = p.depth ? numbers(base, p.depth) : null;
    for (let i = 0; i < base.numRows; i++) {
      const r = depth ? radiusAtDepth(depth[i], depthExaggeration) : 1;
      geoToXYZ(lat[i], lon[i], r, out, i * 3);
    }
  } else {
    const xs = [numbers(base, p.x), numbers(base, p.y), numbers(base, p.z)];
    for (let i = 0; i < base.numRows; i++) {
      for (let a = 0; a < 3; a++) out[i * 3 + a] = xs[a][i];
    }
  }
  return out;
}
