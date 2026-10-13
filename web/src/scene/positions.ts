// Pure: a dataset's rows -> scene positions, from its DatasetSchema position spec.
import type { DatasetSchema } from '../contracts/contracts.ts';
import { numbers, range } from '../data/arrow.ts';
import type { Columns } from '../data/arrow.ts';
import { geoToXYZ, radiusAtDepth } from './geo.ts';

/** The largest value of a `height` column rises this far above the surface (Earth radius = 1). */
const HEIGHT_SCALE = 0.12;

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
    const height = p.height ? numbers(base, p.height) : null;
    const [hLo, hHi] = height ? range(height) : [0, 1];
    for (let i = 0; i < base.numRows; i++) {
      let r = depth ? radiusAtDepth(depth[i], depthExaggeration) : 1;
      if (height) r += ((height[i] - hLo) / (hHi - hLo || 1) || 0) * HEIGHT_SCALE;
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
