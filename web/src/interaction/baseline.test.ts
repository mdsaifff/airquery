import { describe, expect, it } from 'vitest';
import { buildSpec, DEFAULT_FORM, TaskTimer } from './baseline.ts';

describe('buildSpec', () => {
  it('the default form shows everything, coloured by depth', () => {
    const s = buildSpec(DEFAULT_FORM);
    expect(s.filters).toEqual([]);
    expect(s.mode).toBe('replace');
    expect(s.color_by).toBe('depth_km');
    expect(s.limit).toBeNull();
  });

  it('maps every control to spec fields', () => {
    const s = buildSpec({
      depth: 'deep',
      minMagnitude: '6',
      place: 'Japan',
      period: '2024-02',
      colorBy: 'magnitude',
      top: '10',
    });
    expect(s.filters).toEqual([
      { field: 'depth_km', op: '>', value: 300 },
      { field: 'magnitude', op: '>=', value: 6 },
      { field: 'place', op: 'contains', value: 'Japan' },
      { field: 'time', op: 'between', value: ['2024-02-01', '2024-02-29T23:59:59'] }, // leap year
    ]);
    expect(s.sort).toEqual({ field: 'magnitude', direction: 'desc' });
    expect(s.limit).toBe(10);
    expect(buildSpec({ ...DEFAULT_FORM, period: '2024' }).filters[0].value).toEqual([
      '2024-01-01',
      '2024-12-31T23:59:59',
    ]);
  });
});

describe('TaskTimer', () => {
  it('times tasks, counts errors and exports CSV', () => {
    const t = new TaskTimer();
    expect(t.finish('p', 'mouse', 0)).toBeNull();
    t.start(1, 1000);
    t.error();
    t.error();
    expect(t.finish('Ana', 'mouse', 13_460)).toEqual({
      participant: 'Ana',
      mode: 'mouse',
      task: 2,
      seconds: 12.5,
      errors: 2,
      completed: true,
    });
    t.start(4, 0);
    t.finish('Ana', 'hands', 61_000, false);
    expect(t.csv()).toBe(
      'participant,mode,task,seconds,errors,completed\n"Ana",mouse,2,12.5,2,1\n"Ana",hands,5,61,0,0\n',
    );
  });
});
