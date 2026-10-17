import { describe, expect, it } from 'vitest';
import { Pinch } from './pinch.ts';

describe('Pinch', () => {
  it('reports the spread ratio between two fingers, nothing with one', () => {
    const p = new Pinch();
    p.down(1, 0, 0);
    expect(p.move(1, 5, 0)).toBeNull();
    p.down(2, 105, 0); // spread 100
    expect(p.move(2, 205, 0)).toBeCloseTo(2); // spread 200
    p.up(2);
    expect(p.count).toBe(1);
    expect(p.move(1, 0, 0)).toBeNull();
  });
});
