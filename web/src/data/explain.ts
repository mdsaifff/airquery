// Pure: turn the aggregate row DuckDB computed for a selection into one sentence.
// The numbers come from SQL (compile_explain); no LLM is involved in this step.
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

export function explainSentence(dataset: string, row: Row): string {
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
  return `${plural(n, 'point')} selected.`;
}
