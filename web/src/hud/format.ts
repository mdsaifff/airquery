// Pure formatting helpers for the HUD.
import type { QuerySpec } from '../contracts/contracts.ts';

const DEFAULTS: Partial<Record<keyof QuerySpec, unknown>> = {
  version: 1,
  intent: 'query',
  mode: 'refine',
};

/** Spec without nulls, empty lists and default values: what actually changed the scene. */
export function compactSpec(spec: QuerySpec | null): Record<string, unknown> | null {
  if (!spec) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(spec)) {
    if (v === null || (Array.isArray(v) && v.length === 0)) continue;
    if (DEFAULTS[k as keyof QuerySpec] === v || k === 'dataset') continue;
    out[k] = v;
  }
  return out;
}

/** One line per key, short enough for a side panel. */
export function prettySpec(spec: QuerySpec | null): string {
  const c = compactSpec(spec);
  if (!c || Object.keys(c).length === 0) return '{ }  (everything)';
  const lines = Object.entries(c).map(([k, v]) => {
    if (k === 'filters' && Array.isArray(v)) {
      const exprs = (v as QuerySpec['filters']).map((f) => `${f.field} ${f.op} ${JSON.stringify(f.value)}`); // prettier-ignore
      return `  filters: [${exprs.join(', ')}]`;
    }
    return `  ${k}: ${JSON.stringify(v)}`;
  });
  return `{\n${lines.join(',\n')}\n}`;
}

/** Break SQL before its main clauses for display. */
export function prettySql(sql: string): string {
  return sql.replace(/ (FROM|WHERE|AND|ORDER BY|LIMIT) /g, '\n$1 ');
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '–';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function formatLegendValue(v: number, isTime: boolean): string {
  if (isTime) return new Date(v).toISOString().slice(0, 10);
  if (v !== 0 && Math.abs(v) < 0.1) return String(Number(v.toPrecision(2))); // tiny masses
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
}

/** One animation step toward a target number (snaps within 0.5), for ticking counters. */
export function approach(current: number, target: number, k: number): number {
  const next = current + (target - current) * k;
  return Math.abs(target - next) < 0.5 ? target : next;
}
