// Pure: a dropped CSV's columns -> a DatasetSchema the agent can validate against.
import type { Column, DatasetSchema } from '../contracts/contracts.ts';
import { range } from './arrow.ts';
import type { Columns } from './arrow.ts';

export interface CsvMapping {
  lat: string;
  lon: string;
  /** Optional numeric column drawn as height above the surface. */
  height: string | null;
}

const LAT = /^(lat|latitude|y_?lat)$/i;
const LON = /^(lon|lng|long|longitude|x_?lon)$/i;
const MAX_EXAMPLES = 8;
const MAX_TEXT = 40;

/** "Airbnb listings (NYC).csv" -> "user_airbnb_listings_nyc". */
export function datasetName(fileName: string): string {
  const slug = fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `user_${slug.slice(0, 40) || 'data'}`;
}

/** Best guess at lat/lon from column names; height is left for the user to choose. */
export function guessMapping(cols: Columns): Partial<CsvMapping> {
  const numeric = [...cols.numbers.keys()];
  return {
    lat: numeric.find((c) => LAT.test(c)),
    lon: numeric.find((c) => LON.test(c)),
    height: null,
  };
}

function textColumn(name: string, values: string[]): Column {
  const counts = new Map<string, number>();
  for (const v of values) if (v && v !== 'null') counts.set(v, (counts.get(v) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v.slice(0, MAX_TEXT));
  return {
    name,
    type: 'text',
    examples: top.slice(0, MAX_EXAMPLES),
    categorical: counts.size <= MAX_EXAMPLES,
  };
}

export function inferSchema(
  name: string,
  fileName: string,
  cols: Columns,
  m: CsvMapping,
): DatasetSchema {
  const columns: Column[] = [];
  for (const [col, values] of cols.numbers) {
    if (col === m.lat || col === m.lon) continue;
    const [lo, hi] = range(values);
    if (cols.timeColumns?.has(col)) {
      const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
      columns.push({ name: col, type: 'timestamp', min: iso(lo), max: iso(hi) });
    } else {
      columns.push({ name: col, type: 'number', min: lo, max: hi });
    }
  }
  for (const [col, values] of cols.strings) {
    if (col !== '__id') columns.push(textColumn(col, values));
  }
  const firstNumber = columns.find((c) => c.type === 'number')?.name ?? null;
  return {
    dataset: name,
    table: name,
    description: `The user's CSV "${fileName.slice(0, 60)}", ${cols.numRows} rows`,
    id: '__id',
    position: { kind: 'geo', lat: m.lat, lon: m.lon, depth: null, height: m.height },
    columns: columns.slice(0, 64),
    default_color_by: m.height ?? firstNumber,
    default_size_by: null,
    row_count: cols.numRows,
  };
}
