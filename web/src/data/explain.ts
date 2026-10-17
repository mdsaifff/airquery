// Pure: turn the aggregate row DuckDB computed for a selection into one sentence.
// The numbers come from SQL (compile_explain); no LLM is involved in this step.
import type { DatasetSchema } from '../contracts/contracts.ts';
import type { Columns } from './arrow.ts';

export type Row = Record<string, number | string | undefined>;

/** First row of a result as a plain record. */
export function firstRow(cols: Columns): Row {
  const row: Row = {};
  for (const [k, v] of cols.numbers) row[k] = v[0];
  for (const [k, v] of cols.strings) row[k] = v[0];
  return row;
}

const num = (v: number | string | undefined) => (typeof v === 'number' ? v : NaN);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function where(place: string | undefined): string {
  if (!place || place === 'null') return '';
  // USGS places read "south of the Fiji Islands" or "Japan": keep prepositions as they are.
  return /^(north|south|east|west|near|off|central)\b/i.test(place) ? `, mostly ${place}` : `, mostly near ${place}`; // prettier-ignore
}

/** "wind_kt" -> "wind", "depth_km" -> "depth", "mass_kg" -> "mass". */
const label = (column: string) => column.replace(/_(km|kt|mb|kg|ft|ly)$/, '').replace(/_/g, ' ');
const fmt = (v: number) => String(Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

/** Any other dataset: its noun, its most common category, and the range of its main numbers. */
function genericSentence(schema: DatasetSchema, row: Row): string {
  const n = num(row.n);
  const noun = schema.noun ?? 'points';
  const nouns = n === 1 && noun.endsWith('s') ? noun.slice(0, -1) : noun;
  const mode = schema.columns
    .filter((c) => c.categorical)
    .map((c) => row[`mode_${c.name}`])
    .find((v) => typeof v === 'string' && v !== 'null');
  const numeric = (name: string | null | undefined) =>
    schema.columns.find(
      (c) => c.name === name && c.type === 'number' && Number.isFinite(num(row[`min_${c.name}`])),
    );
  const pos = schema.position;
  const preferred = [schema.default_size_by, schema.default_color_by, pos.kind === 'geo' ? pos.depth : null]; // prettier-ignore
  const skip = new Set(pos.kind === 'geo' ? [pos.lat, pos.lon] : [pos.x, pos.y, pos.z]);
  let cols = [...new Set(preferred.map(numeric).filter((c) => c !== undefined))];
  if (cols.length === 0) {
    const first = schema.columns.find((c) => !skip.has(c.name) && numeric(c.name));
    cols = first ? [first] : [];
  }
  const ranges = cols.slice(0, 2).map((c) => {
    const [lo, hi] = [num(row[`min_${c.name}`]), num(row[`max_${c.name}`])];
    const unit = c.unit && !c.unit.includes(',') && c.unit !== 'year' && c.unit !== 'degrees' ? ` ${c.unit}` : ''; // prettier-ignore
    return `, ${label(c.name)} ${lo === hi ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)}`}${unit}`;
  });
  return `This area has ${n} ${nouns}${mode ? `, mostly ${mode}` : ''}${ranges.join('')}.`;
}

export function explainSentence(dataset: string, row: Row, schema?: DatasetSchema): string {
  const n = num(row.n);
  if (!(n > 0)) return 'There are no visible points there.';
  if (dataset === 'quakes') {
    const depth = Math.round(num(row.avg_depth_km));
    const maxMag = num(row.max_magnitude).toFixed(1);
    return `${n === 1 ? 'This is' : 'This cluster has'} ${plural(n, 'earthquake')}, ${depth} km deep on average, up to magnitude ${maxMag}${where(row.mode_place as string | undefined)}.`; // prettier-ignore
  }
  if (dataset === 'papers') {
    const lo = num(row.min_year);
    const hi = num(row.max_year);
    const years = lo === hi ? `from ${lo}` : `from ${lo} to ${hi}`;
    return `This region has ${plural(n, 'paper')}, mostly ${String(row.mode_field)}, ${years}.`;
  }
  return schema ? genericSentence(schema, row) : `${plural(n, 'point')} selected.`;
}
