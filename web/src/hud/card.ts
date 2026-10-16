// Pure: what the hover card shows for one point. Strings pass through untouched;
// tooltip.ts renders them with textContent.
import type { DatasetSchema } from '../contracts/contracts.ts';
import type { Columns } from '../data/arrow.ts';
import { DEPTH_GAUGE_MAX_KM, depthClass, magnitudeClass } from './quakeClass.ts';

export interface Card {
  title: string;
  badge: { value: string; label: string } | null;
  gauge: { pct: number; label: string } | null;
  rows: [string, string][];
}

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }); // prettier-ignore
const fmtNum = (v: number) =>
  Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 }); // prettier-ignore

export function cardFor(schema: DatasetSchema, base: Columns, i: number): Card {
  if (schema.dataset === 'quakes') return quakeCard(base, i);
  if (schema.dataset === 'papers') return paperCard(base, i);
  return genericCard(schema, base, i);
}

function quakeCard(base: Columns, i: number): Card {
  const mag = base.numbers.get('magnitude')?.[i] ?? NaN;
  const depth = base.numbers.get('depth_km')?.[i] ?? NaN;
  const time = base.numbers.get('time')?.[i];
  const lat = base.numbers.get('lat')?.[i] ?? NaN;
  const lon = base.numbers.get('lon')?.[i] ?? NaN;
  const rows: [string, string][] = [];
  if (time !== undefined) {
    rows.push(
      ['Date', fmtDate(time)],
      ['Time', `${new Date(time).toISOString().slice(11, 16)} UTC`],
    );
  }
  rows.push(['Location', `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`]);
  return {
    title: base.strings.get('place')?.[i] || 'Unknown place',
    badge: Number.isFinite(mag)
      ? { value: `M${mag.toFixed(1)}`, label: magnitudeClass(mag) }
      : null,
    gauge: Number.isFinite(depth)
      ? { pct: Math.min(100, (depth / DEPTH_GAUGE_MAX_KM) * 100), label: `${depth.toFixed(0)} km deep · ${depthClass(depth)}` } // prettier-ignore
      : null,
    rows,
  };
}

function paperCard(base: Columns, i: number): Card {
  const title = base.strings.get('title')?.[i] ?? '';
  const year = base.numbers.get('year')?.[i];
  return {
    title: title.length > 90 ? `${title.slice(0, 87)}…` : title,
    badge: null,
    gauge: null,
    rows: [
      ['Year', year === undefined ? '' : String(year)],
      ['Field', base.strings.get('field')?.[i] ?? ''],
      ['arXiv', base.strings.get('id')?.[i] ?? ''],
    ],
  };
}

function genericCard(schema: DatasetSchema, base: Columns, i: number): Card {
  const cols = schema.columns.filter((c) => !c.name.startsWith('__'));
  const firstText = cols.find((c) => c.type === 'text');
  const value = (name: string, type: string): string => {
    const s = base.strings.get(name);
    if (s) return s[i] ?? '';
    const n = base.numbers.get(name)?.[i];
    if (n === undefined || !Number.isFinite(n)) return '';
    return type === 'timestamp' ? fmtDate(n) : fmtNum(n);
  };
  const title = firstText ? value(firstText.name, 'text') : '';
  const rows = cols
    .filter((c) => c !== firstText)
    .slice(0, 6)
    .map((c): [string, string] => [c.name, value(c.name, c.type)]);
  return { title: title || `Row ${i + 1}`, badge: null, gauge: null, rows };
}
