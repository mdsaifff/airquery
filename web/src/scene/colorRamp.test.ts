import { describe, expect, it } from 'vitest';
import { CATEGORY_HEX, OTHER_HEX, rampPosition } from './colorRamp.ts';

describe('rampPosition', () => {
  it('is linear for ordinary ranges', () => {
    expect(rampPosition(5, 4.5, 7.5)).toBeCloseTo(1 / 6);
    expect(rampPosition(-1, 0, 10)).toBe(0); // clamped
  });

  it('goes logarithmic for positive data spanning 1000x or more (meteorite masses)', () => {
    // 1 kg between 0.00001 kg and 60 000 kg: mid-scale, not lost at the bottom
    expect(rampPosition(1, 0.00001, 60000)).toBeCloseTo(0.5113, 3);
    expect(rampPosition(60000, 0.00001, 60000)).toBeCloseTo(1);
  });
});

describe('category palette', () => {
  it('has a colour of its own for up to 8 categories (star classes OBAFGKM, meteorite kinds)', () => {
    expect(new Set(CATEGORY_HEX).size).toBeGreaterThanOrEqual(8);
    expect(CATEGORY_HEX).not.toContain(OTHER_HEX);
  });
});
