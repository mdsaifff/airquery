// Pure: what the globe says back. Counts, regions and magnitudes come from the
// dashboard (computed from the data on screen); the LLM supplies no numbers here.
import type { QuerySpec, Timeline, ViewChange } from '../contracts/contracts.ts';
import type { Dashboard } from '../hud/dashboard.ts';

type F = QuerySpec['filters'][number];
const num = (v: F['value']) => (Array.isArray(v) ? v.join(' to ') : String(v));

function phrase(f: F): string | null {
  const v = f.value;
  if (f.field === 'depth_km') {
    if (f.op === '>' || f.op === '>=') return `deeper than ${num(v)} km`;
    if (f.op === '<' || f.op === '<=') return `shallower than ${num(v)} km`;
    if (f.op === 'between') return `between ${num(v)} km deep`;
  }
  if (f.field === 'magnitude') {
    if (f.op === '>=' || f.op === '>') return `magnitude ${num(v)} and up`;
    if (f.op === '<' || f.op === '<=') return `below magnitude ${num(v)}`;
    if (f.op === 'between') return `magnitude ${num(v)}`;
  }
  if (f.op === 'contains') return `in ${String(v)}`;
  if (f.field === 'lat' || f.field === 'lon') return 'around there';
  // Any other column: a plain phrase ("with category 4 and up", "with type large airport").
  const name = f.field.replace(/_(km|kt|mb|kg|ft|ly)$/, '').replace(/_/g, ' ');
  if (f.op === '>' || f.op === '>=') return `with ${name} ${num(v)} and up`;
  if (f.op === '<' || f.op === '<=') return `with ${name} below ${num(v)}`;
  if (f.op === 'between') return `with ${name} ${num(v)}`;
  if (f.op === '=') return `with ${name} ${String(v)}`;
  if (f.op === 'in') return `with ${name} ${Array.isArray(v) ? v.join(' or ') : String(v)}`;
  if (f.op === 'last_days') return `from the last ${num(v)} days`;
  return null;
}

/** The size column and its unit, for "up to 165 knots" (quakes keep "strongest magnitude"). */
export interface SizeUnit {
  column: string;
  unit: string | null;
}

export function describeView(
  spec: QuerySpec | null,
  dash: Dashboard | null,
  noun: string,
  size?: SizeUnit,
): string {
  if (!dash) return '';
  if (dash.count === 0) return `No ${noun} match that.`;
  const parts = [...new Set((spec?.filters ?? []).map(phrase).filter((p): p is string => !!p))];
  const n = dash.count.toLocaleString('en-US');
  const head = parts.length ? `${n} ${noun} ${parts.join(', ')}` : `All ${n} ${noun}`;
  const top = dash.charts.find((c) => c.kind === 'text')?.bars[0]?.label;
  const near = top && !parts.some((p) => p.includes(top)) ? `, mostly near ${top}` : '';
  const max = dash.maxSize;
  const unit = size?.unit && !size.unit.includes(',') ? ` ${size.unit}` : '';
  const strongest =
    max === null
      ? ''
      : !size || size.column === 'magnitude'
        ? `, strongest magnitude ${max.toFixed(1)}`
        : `, up to ${Math.abs(max) >= 100 ? Math.round(max) : max.toFixed(1)}${unit}`;
  return `${head}${near}${strongest}.`;
}

/** A toast spoken aloud: the sentence, without the raw details in trailing brackets. */
export function spokenNotice(text: string): string {
  const plain = text.replace(/\s*\([^)]*\)\s*$/, '');
  return plain === text ? text : `${plain}.`;
}

const SPEED: Record<string, string> = { day: 'a day', week: 'a week', month: 'a month' };

export function timelineSentence(t: Timeline, dateLabel: string): string {
  if (t.action === 'play')
    return `Playing the year${t.speed ? `, ${SPEED[t.speed]} per second` : ''}.`;
  if (t.action === 'pause') return `Paused at ${dateLabel}.`;
  if (t.action === 'stop') return 'Back to the whole year.';
  if (t.action === 'seek') return `Jumped to ${dateLabel}.`;
  return `Now ${SPEED[t.speed ?? 'month']} per second.`;
}

export function viewSentence(v: ViewChange): string {
  const out: string[] = [];
  if (v.xray !== null) out.push(v.xray ? 'X-ray on.' : 'X-ray off.');
  if (v.stats !== null) out.push(v.stats ? 'Stats shown.' : 'Stats hidden.');
  if (v.share) out.push('Link copied.');
  if (v.mute !== null) out.push(v.mute ? 'Voice off.' : 'Voice on.');
  return out.join(' ');
}
