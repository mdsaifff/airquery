// Applies a SceneView to a point cloud: visibility mask + colour/size encodings,
// all through in-place attribute updates. Returns the legend to show.
import type { DatasetSchema } from '../contracts/contracts.ts';
import { range } from '../data/arrow.ts';
import type { Columns } from '../data/arrow.ts';
import type { SceneView } from '../data/querySession.ts';
import { maskFromResult } from '../data/resultMask.ts';
import { CATEGORY_HEX, OTHER_HEX } from './colorRamp.ts';
import type { PointCloud } from './pointCloud.ts';

export type Legend =
  | { kind: 'ramp'; column: string; unit: string | null; min: number; max: number; isTime: boolean }
  | { kind: 'categories'; column: string; items: { label: string; color: string }[] };

function bounds(schema: DatasetSchema, column: string, values: Float64Array): [number, number] {
  const col = schema.columns.find((c) => c.name === column);
  const toNum = (v: number | string | null | undefined) =>
    typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v.endsWith('Z') ? v : `${v}Z`) : NaN; // prettier-ignore
  const lo = toNum(col?.min);
  const hi = toNum(col?.max);
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : range(values);
}

function applyColor(
  cloud: PointCloud,
  base: Columns,
  schema: DatasetSchema,
  colorBy: string,
): Legend | null {
  const col = schema.columns.find((c) => c.name === colorBy);
  const text = base.strings.get(colorBy);
  if (col?.categorical && text) {
    const cats = col.examples ?? [];
    cloud.setCategoryColors(text, cats);
    const items = cats.slice(0, CATEGORY_HEX.length).map((label, i) => ({ label, color: CATEGORY_HEX[i] })); // prettier-ignore
    if (cats.length > CATEGORY_HEX.length) items.push({ label: 'other', color: OTHER_HEX });
    return { kind: 'categories', column: colorBy, items };
  }
  const values = base.numbers.get(colorBy);
  if (!values) return null;
  const [min, max] = bounds(schema, colorBy, values);
  cloud.setColors(values, min, max);
  return { kind: 'ramp', column: colorBy, unit: col?.unit ?? null, min, max, isTime: col?.type === 'timestamp' }; // prettier-ignore
}

export function applyView(
  cloud: PointCloud,
  base: Columns,
  schema: DatasetSchema,
  idIndex: Map<string, number>,
  mask: Uint8Array,
  view: SceneView,
): {
  shown: number;
  legend: Legend | null;
  size: { column: string; min: number; max: number } | null;
} {
  let shown = cloud.count;
  if (view.result) {
    shown = maskFromResult(view.result, schema.id ?? 'id', idIndex, mask);
    cloud.setVisibility(mask);
  } else {
    cloud.setVisibility(null);
  }
  const colorBy = view.colorBy ?? schema.default_color_by ?? null;
  const legend = colorBy ? applyColor(cloud, base, schema, colorBy) : null;
  const sizeBy = view.sizeBy ?? schema.default_size_by ?? null;
  const sizes = sizeBy ? base.numbers.get(sizeBy) : undefined;
  let size: { column: string; min: number; max: number } | null = null;
  if (sizeBy && sizes) {
    const [min, max] = bounds(schema, sizeBy, sizes);
    cloud.setSizes(sizes, min, max);
    size = { column: sizeBy, min, max };
  } else {
    cloud.setSizes(null, 0, 1);
  }
  return { shown, legend, size };
}
