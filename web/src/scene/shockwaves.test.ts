import { describe, expect, it } from 'vitest';
import { Shockwaves, strongestVisible } from './shockwaves.ts';

describe('strongestVisible', () => {
  const mags = [6.6, 7.4, 5.0, 6.9, 8.1];
  it('keeps visible values at or above the minimum, strongest first, capped', () => {
    const visible = new Uint8Array([1, 1, 1, 1, 0]); // the 8.1 is filtered out
    expect(strongestVisible(mags, visible, 6.5, 10)).toEqual([1, 3, 0]);
    expect(strongestVisible(mags, visible, 6.5, 2)).toEqual([1, 3]);
  });
});

describe('Shockwaves', () => {
  it('sets one instance per index and hides at zero opacity', () => {
    const s = new Shockwaves(4);
    const surface = new Float32Array([0, 0, 1.004, 0, 1.004, 0]);
    s.set([1, 0], surface, new Float32Array(6).fill(1), [7, 6.6], 6.5);
    expect(s.mesh.count).toBe(2);
    s.update(1000, 3200, 0);
    expect(s.mesh.visible).toBe(false);
    s.update(1000, 3200, 1);
    expect(s.mesh.visible).toBe(true);
  });
});
