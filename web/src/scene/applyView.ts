// Applies a SceneView to the globe: visibility mask + colour/size encodings,
// all through in-place attribute updates. Returns the legend to show.
import type { DatasetSchema } from '../contracts/contracts.ts';
import { range } from '../data/arrow.ts';
import type { Columns } from '../data/arrow.ts';
import type { SceneView } from '../data/querySession.ts';
import { maskFromResult } from '../data/resultMask.ts';
import type { GlobeScene } from './globeScene.ts';

export interface Legend {
  column: string;
  unit: string | null;
  min: number;
  max: number;
  isTime: boolean;
}

function bounds(schema: DatasetSchema, column: string, values: Float64Array): [number, number] {
  const col = schema.columns.find((c) => c.name === column);
  const toNum = (v: number | string | null | undefined) =>
    typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v.endsWith('Z') ? v : `${v}Z`) : NaN; // prettier-ignore
  const lo = toNum(col?.min);
  const hi = toNum(col?.max);
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : range(values);
}

export function applyView(
  globe: GlobeScene,
  base: Columns,
  schema: DatasetSchema,
  idIndex: Map<string, number>,
  mask: Uint8Array,
  view: SceneView,
): { shown: number; legend: Legend | null } {
  let shown = globe.count;
  if (view.result) {
    shown = maskFromResult(view.result, schema.id ?? 'id', idIndex, mask);
    globe.setVisibility(mask);
  } else {
    globe.setVisibility(null);
  }

  let legend: Legend | null = null;
  const colorBy = view.colorBy ?? schema.default_color_by ?? null;
  const colors = colorBy ? base.numbers.get(colorBy) : undefined;
  if (colorBy && colors) {
    const [min, max] = bounds(schema, colorBy, colors);
    globe.setColors(colors, min, max);
    const col = schema.columns.find((c) => c.name === colorBy);
    legend = { column: colorBy, unit: col?.unit ?? null, min, max, isTime: col?.type === 'timestamp' }; // prettier-ignore
  }
  const sizeBy = view.sizeBy ?? schema.default_size_by ?? null;
  const sizes = sizeBy ? base.numbers.get(sizeBy) : undefined;
  if (sizeBy && sizes) globe.setSizes(sizes, ...bounds(schema, sizeBy, sizes));
  else globe.setSizes(null, 0, 1);
  return { shown, legend };
}
