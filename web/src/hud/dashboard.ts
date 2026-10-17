// Pure: the dashboard's charts for what is on screen, from the loaded columns and the
// visibility mask. No SQL: loops over typed arrays, recomputed once per view change.
import type { DatasetSchema } from '../contracts/contracts.ts';
import { range } from '../data/arrow.ts';
import type { Columns } from '../data/arrow.ts';
import { isLogScale } from '../scene/colorRamp.ts';
import { formatLegendValue } from './format.ts';

/** One bar: [lo, hi) — or [lo, hi] when closed (the last bin, months, regions). */
export interface Bar {
  label: string;
  count: number;
  lo: number;
  hi: number;
  closed: boolean;
}
export interface Chart {
  key: 'size' | 'depth' | 'color' | 'time' | 'text';
  title: string;
  field: string;
  kind: 'range' | 'time' | 'text';
  bars: Bar[];
}
export interface Dashboard {
  count: number;
  maxSize: number | null;
  medianDepth: number | null;
  charts: Chart[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Depth bands (km): shallow 0–70, intermediate 70–300, deep 300+. */
export const DEPTH_EDGES = [0, 70, 300];
const short = (v: number) => String(Math.round(v * 100) / 100);

export function niceWidth(span: number, bins = 8): number {
  const raw = span / bins || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 5, 10].find((m) => m * p >= raw - 1e-12) ?? 10) * p;
}

export function histogram(
  values: ArrayLike<number>,
  mask: Uint8Array,
  lo: number,
  hi: number,
  width: number,
): Bar[] {
  const start = Math.floor(lo / width + 1e-9) * width;
  const n = Math.max(1, Math.ceil((hi - start) / width - 1e-9));
  const bars: Bar[] = Array.from({ length: n }, (_, k) => {
    const a = start + k * width;
    return {
      label: short(a),
      count: 0,
      lo: Math.max(lo, a),
      hi: Math.min(hi, a + width),
      closed: k === n - 1,
    };
  });
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!mask[i] || !Number.isFinite(v)) continue;
    bars[Math.min(n - 1, Math.max(0, Math.floor((v - start) / width + 1e-9)))].count++;
  }
  return bars;
}

export function bands(
  values: ArrayLike<number>,
  mask: Uint8Array,
  edges: number[],
  max: number,
): Bar[] {
  const bars: Bar[] = edges.map((a, k) => {
    const last = k === edges.length - 1;
    const b = last ? Math.max(max, a) : edges[k + 1];
    return { label: last ? `${a}+` : `${a}–${b}`, count: 0, lo: a, hi: b, closed: last };
  });
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!mask[i] || !Number.isFinite(v)) continue;
    let k = 0;
    while (k + 1 < edges.length && v >= edges[k + 1]) k++;
    bars[k].count++;
  }
  return bars;
}

/** Bar edges every 1000x, for data the globe draws on a log scale (meteorite mass). */
export function logEdges(lo: number, hi: number): number[] {
  const edges: number[] = [];
  for (let k = Math.floor(Math.log10(lo)); 10 ** k <= hi; k += 3)
    edges.push(Number((10 ** k).toPrecision(1)));
  return edges;
}

/** Twelve monthly bars for one calendar year; null when the data spans several years. */
export function byMonth(times: ArrayLike<number>, mask: Uint8Array): Bar[] | null {
  let year: number | null = null;
  const counts = new Array<number>(12).fill(0);
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (!Number.isFinite(t)) continue;
    const d = new Date(t);
    const y = d.getUTCFullYear();
    if (year === null) year = y;
    else if (y !== year) return null;
    if (mask[i]) counts[d.getUTCMonth()]++;
  }
  if (year === null) return null;
  const y = year;
  return counts.map((count, m) => ({
    label: MONTHS[m], count, lo: Date.UTC(y, m, 1), hi: Date.UTC(y, m + 1, 1) - 1000, closed: true,
  })); // prettier-ignore
}

/** "41 km ESE of X, Chile" -> "Chile"; "Japan region" -> "Japan" (a click filters with
 *  contains, which matches both, so the bar has to count both). */
export function region(place: string): string {
  const k = place.lastIndexOf(',');
  return (k >= 0 ? place.slice(k + 1) : place).trim().replace(/\s+region$/i, '');
}

export function topRegions(places: readonly string[], mask: Uint8Array, n = 10): Bar[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    if (!mask[i] || !p || p === 'null') continue;
    const r = region(p);
    if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([label, count]) => ({ label, count, lo: 0, hi: 0, closed: true }));
}

function maskedStats(values: ArrayLike<number> | undefined, mask: Uint8Array) {
  if (!values) return { max: null, median: null };
  const v: number[] = [];
  for (let i = 0; i < values.length; i++)
    if (mask[i] && Number.isFinite(values[i])) v.push(values[i]);
  if (v.length === 0) return { max: null, median: null };
  v.sort((a, b) => a - b);
  const mid = v.length >> 1;
  return { max: v[v.length - 1], median: v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2 };
}

const title = (column: string) => {
  const t = column.replace(/_km$/, '').replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** The summary's top number: "strongest 7.8" for quakes, "max wind 165" for anything else. */
export function maxTile(field: string | undefined, v: number): { label: string; value: string } {
  if (!field || field === 'magnitude') return { label: 'strongest', value: v.toFixed(1) };
  const name = field.replace(/_(km|kt|mb|kg|ft|ly)$/, '').replace(/_/g, ' ');
  return { label: `max ${name}`, value: formatLegendValue(v, false) };
}

export function computeDashboard(
  schema: DatasetSchema,
  base: Columns,
  mask: Uint8Array,
): Dashboard {
  let count = 0;
  for (let i = 0; i < mask.length; i++) count += mask[i];
  const pos = schema.position;
  const depthCol = pos.kind === 'geo' ? (pos.depth ?? null) : null;
  const sizeCol = schema.default_size_by ?? null;
  const colorCol = schema.default_color_by ?? null;
  const charts: Chart[] = [];
  const hist = (key: Chart['key'], field: string, values: ArrayLike<number>) => {
    const [lo, hi] = range(values);
    if (!(hi >= lo)) return;
    if (isLogScale(lo, hi)) {
      charts.push({ key, title: title(field), field, kind: 'range', bars: bands(values, mask, logEdges(lo, hi), hi) }); // prettier-ignore
      return;
    }
    charts.push({ key, title: title(field), field, kind: 'range', bars: histogram(values, mask, lo, hi, niceWidth(hi - lo, 6)) }); // prettier-ignore
  };
  const sizes = sizeCol ? base.numbers.get(sizeCol) : undefined;
  if (sizeCol && sizes) hist('size', sizeCol, sizes);
  const depths = depthCol ? base.numbers.get(depthCol) : undefined;
  const maxDepth = depths ? range(depths)[1] : 0;
  if (depthCol && depths && maxDepth > DEPTH_EDGES[2]) {
    charts.push({ key: 'depth', title: 'Depth (km)', field: depthCol, kind: 'range', bars: bands(depths, mask, DEPTH_EDGES, maxDepth) }); // prettier-ignore
  } else if (depthCol && depths) {
    hist('depth', depthCol, depths); // too shallow for the earthquake bands (deep-sea corals)
  } else if (colorCol && colorCol !== sizeCol && !base.timeColumns?.has(colorCol)) {
    const values = base.numbers.get(colorCol);
    if (values) hist('color', colorCol, values);
  }
  const timeCol = schema.columns.find((c) => c.type === 'timestamp')?.name;
  const times = timeCol ? base.numbers.get(timeCol) : undefined;
  const months = timeCol && times ? byMonth(times, mask) : null;
  if (timeCol && months) charts.push({ key: 'time', title: 'By month', field: timeCol, kind: 'time', bars: months }); // prettier-ignore
  const places = base.strings.get('place');
  if (places) charts.push({ key: 'text', title: 'Top regions', field: 'place', kind: 'text', bars: topRegions(places, mask) }); // prettier-ignore
  const size = maskedStats(sizes, mask);
  const depth = maskedStats(depths, mask);
  return { count, maxSize: size.max, medianDepth: depth.median, charts };
}

type Filter = { field: string; op: string; value: number | string | (number | string)[] };
const asNum = (v: number | string) => (typeof v === 'number' ? v : Date.parse(v.length === 10 ? `${v}T00:00:00Z` : `${v}Z`)); // prettier-ignore

/** The bars a filter on this chart's field covers (lit up after a spoken filter). */
export function coveredBars(chart: Chart, filters: readonly Filter[]): Set<number> {
  const out = new Set<number>();
  for (const f of filters) {
    if (f.field !== chart.field) continue;
    chart.bars.forEach((b, i) => {
      if (chart.kind === 'text') {
        if (f.op === 'contains' && b.label.toLowerCase().includes(String(f.value).toLowerCase()))
          out.add(i);
        return;
      }
      const v = f.value;
      const [lo, hi] = Array.isArray(v) ? [asNum(v[0]), asNum(v[1])] : [asNum(v), asNum(v)];
      const hit =
        f.op === 'between' ? (b.closed ? b.hi >= lo : b.hi > lo) && b.lo <= hi
        : f.op === '>' || f.op === '>=' ? b.hi > lo
        : f.op === '<' || f.op === '<=' ? b.lo < hi
        : f.op === '=' ? b.lo <= lo && lo <= b.hi
        : false; // prettier-ignore
      if (hit) out.add(i);
    });
  }
  return out;
}
