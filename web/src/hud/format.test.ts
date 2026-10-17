import { describe, expect, it } from 'vitest';
import type { QuerySpec } from '../contracts/contracts.ts';
import {
  approach,
  compactSpec,
  formatLegendValue,
  formatMs,
  prettySpec,
  prettySql,
} from './format.ts';

const spec: QuerySpec = {
  version: 1,
  dataset: 'quakes',
  intent: 'query',
  mode: 'refine',
  filters: [{ field: 'depth_km', op: '>', value: 300 }],
  color_by: 'magnitude',
  size_by: null,
  sort: null,
  limit: null,
  camera_target: null,
  timeline: null,
  view: null,
};

describe('HUD formatting', () => {
  it('compacts a spec to what matters', () => {
    expect(compactSpec(spec)).toEqual({
      filters: [{ field: 'depth_km', op: '>', value: 300 }],
      color_by: 'magnitude',
    });
    expect(compactSpec({ ...spec, mode: 'replace', filters: [] })).toEqual({
      mode: 'replace',
      color_by: 'magnitude',
    });
    expect(compactSpec(null)).toBeNull();
  });

  it('pretty-prints spec and SQL', () => {
    expect(prettySpec(null)).toBe('{ }  (everything)');
    expect(prettySpec(spec)).toBe('{\n  filters: [depth_km > 300],\n  color_by: "magnitude"\n}');
    expect(prettySql('SELECT "id" FROM "q" WHERE "a" > ? AND "b" < ? LIMIT 10')).toBe(
      'SELECT "id"\nFROM "q"\nWHERE "a" > ?\nAND "b" < ?\nLIMIT 10',
    );
  });

  it('formats times and legend values', () => {
    expect(formatMs(0)).toBe('–');
    expect(formatMs(640.4)).toBe('640 ms');
    expect(formatMs(1234)).toBe('1.23 s');
    expect(formatLegendValue(653.7, false)).toBe('654');
    expect(formatLegendValue(4.5, false)).toBe('4.5');
    expect(formatLegendValue(Date.parse('2024-03-05T10:00:00Z'), true)).toBe('2024-03-05');
  });
});

describe('approach', () => {
  it('moves a fraction of the way and snaps when close', () => {
    expect(approach(0, 100, 0.25)).toBe(25);
    expect(approach(99.8, 100, 0.25)).toBe(100);
    expect(approach(100, 0, 0.5)).toBe(50);
  });
});
