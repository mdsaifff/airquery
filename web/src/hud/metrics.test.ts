import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RingBuffer } from './metrics.ts';

describe('RingBuffer', () => {
  it('keeps the last N values and reports percentiles', () => {
    const b = new RingBuffer(5);
    expect(b.percentile(0.5)).toBeNaN();
    for (let i = 1; i <= 7; i++) b.push(i); // 1,2 fall out
    expect(b.count).toBe(5);
    expect(b.values().sort()).toEqual([3, 4, 5, 6, 7]);
    expect(b.last).toBe(7);
    expect(b.percentile(0.5)).toBe(5);
    expect(b.percentile(0.9)).toBe(7);
    expect(b.percentile(0)).toBe(3);
  });

  it('sorts numerically, not as strings', () => {
    const b = new RingBuffer(4);
    [10, 9, 100, 2].forEach((v) => b.push(v));
    expect(b.percentile(1)).toBe(100);
    expect(b.percentile(0.25)).toBe(2);
  });
});

// Hard rule 5: rendering never waits on tracking or queries.
describe('render loop independence', () => {
  const src = fileURLToPath(new URL('..', import.meta.url));
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
    });

  it('the scene manager loop has no async code', () => {
    expect(readFileSync(join(src, 'scene', 'sceneManager.ts'), 'utf8')).not.toMatch(/\bawait\b|\basync\b/); // prettier-ignore
  });

  it('no onFrame callback is async', () => {
    for (const f of files(src).filter((p) => !p.endsWith('.test.ts'))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/onFrame\(\s*async/);
    }
  });
});
