import { describe, expect, it } from 'vitest';
import { highlightSpec, highlightSql } from './highlight.ts';

const join = (t: { text: string }[]) => t.map((x) => x.text).join('');

describe('highlightSpec', () => {
  it('tags keys, strings and numbers without losing text', () => {
    const src = '{\n  color_by: "magnitude",\n  limit: 10\n}';
    const t = highlightSpec(src);
    expect(join(t)).toBe(src);
    expect(t).toContainEqual({ text: 'color_by', kind: 'key' });
    expect(t).toContainEqual({ text: '"magnitude"', kind: 'str' });
    expect(t).toContainEqual({ text: '10', kind: 'num' });
  });
});

describe('highlightSql', () => {
  it('tags keywords and parameters', () => {
    const src = 'SELECT id FROM quakes\nWHERE depth_km > ?\nLIMIT 10';
    const t = highlightSql(src);
    expect(join(t)).toBe(src);
    expect(t.filter((x) => x.kind === 'kw').map((x) => x.text)).toEqual([
      'SELECT',
      'FROM',
      'WHERE',
      'LIMIT',
    ]);
    expect(t).toContainEqual({ text: '?', kind: 'num' });
  });
});
