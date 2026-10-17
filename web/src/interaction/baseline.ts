// Pure pieces of the mouse baseline (docs/EVAL.md section 4): dropdown form ->
// QuerySpec, and a timer for the five study tasks.
import type { Filter, QuerySpec } from '../contracts/contracts.ts';

export interface BaselineForm {
  depth: 'any' | 'shallow' | 'intermediate' | 'deep' | 'very-deep';
  minMagnitude: 'any' | '5' | '6' | '7';
  /** '' = anywhere; otherwise a place substring. */
  place: string;
  /** 'any', '2024', or a month 'YYYY-MM'. */
  period: string;
  colorBy: 'depth_km' | 'magnitude' | 'time';
  top: 'all' | '10' | '50';
}

export const DEFAULT_FORM: BaselineForm = {
  depth: 'any',
  minMagnitude: 'any',
  place: '',
  period: 'any',
  colorBy: 'depth_km',
  top: 'all',
};

export const DEPTH_OPTIONS: Record<BaselineForm['depth'], string> = {
  any: 'any depth',
  shallow: 'shallow (< 70 km)',
  intermediate: '70–300 km',
  deep: 'deep (> 300 km)',
  'very-deep': 'deeper than 500 km',
};

const DEPTH_FILTERS: Record<BaselineForm['depth'], Filter | null> = {
  any: null,
  shallow: { field: 'depth_km', op: '<', value: 70 },
  intermediate: { field: 'depth_km', op: 'between', value: [70, 300] },
  deep: { field: 'depth_km', op: '>', value: 300 },
  'very-deep': { field: 'depth_km', op: '>', value: 500 },
};

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function periodFilter(period: string): Filter | null {
  if (/^\d{4}$/.test(period)) {
    return { field: 'time', op: 'between', value: [`${period}-01-01`, `${period}-12-31T23:59:59`] };
  }
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const end = lastDay(Number(m[1]), Number(m[2]));
  return { field: 'time', op: 'between', value: [`${period}-01`, `${period}-${end}T23:59:59`] };
}

/** The whole form as one replace-mode spec (the agent still validates and compiles it). */
export function buildSpec(form: BaselineForm, dataset = 'quakes'): QuerySpec {
  const filters = [
    DEPTH_FILTERS[form.depth],
    form.minMagnitude === 'any'
      ? null
      : { field: 'magnitude', op: '>=' as const, value: Number(form.minMagnitude) },
    form.place ? { field: 'place', op: 'contains' as const, value: form.place } : null,
    periodFilter(form.period),
  ].filter((f): f is Filter => f !== null);
  const top = form.top === 'all' ? null : Number(form.top);
  return {
    version: 1,
    dataset,
    intent: 'query',
    mode: 'replace',
    filters,
    color_by: form.colorBy,
    size_by: null,
    sort: top ? { field: 'magnitude', direction: 'desc' } : null,
    limit: top,
    camera_target: null,
    timeline: null,
    view: null,
    switch_to: null,
  };
}

// --- task timer ---

export const STUDY_TASKS = [
  'Find the deepest earthquake cluster and hover one point.',
  'Show only quakes deeper than 300 km.',
  'Colour by magnitude and show the 10 strongest.',
  'Zoom to Japan and filter to 2024 only.',
  'Undo the last change and reset the view.',
] as const;

export type StudyMode = 'hands' | 'mouse';

export interface TaskResult {
  participant: string;
  mode: StudyMode;
  task: number;
  seconds: number;
  errors: number;
  completed: boolean;
}

export class TaskTimer {
  readonly results: TaskResult[] = [];
  current: { task: number; startedAt: number; errors: number } | null = null;

  start(task: number, now: number): void {
    this.current = { task, startedAt: now, errors: 0 };
  }

  error(): void {
    if (this.current) this.current.errors++;
  }

  finish(participant: string, mode: StudyMode, now: number, completed = true): TaskResult | null {
    if (!this.current) return null;
    const r: TaskResult = {
      participant,
      mode,
      task: this.current.task + 1,
      seconds: Math.round((now - this.current.startedAt) / 100) / 10,
      errors: this.current.errors,
      completed,
    };
    this.results.push(r);
    this.current = null;
    return r;
  }

  csv(): string {
    const rows = ['participant,mode,task,seconds,errors,completed'];
    for (const r of this.results) {
      const who = `"${r.participant.replace(/"/g, '""')}"`;
      rows.push([who, r.mode, r.task, r.seconds, r.errors, r.completed ? 1 : 0].join(','));
    }
    return rows.join('\n') + '\n';
  }
}
