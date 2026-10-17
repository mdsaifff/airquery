import { describe, expect, it } from 'vitest';
import { depthBands, depthTicks, sizeSamples } from './legend.ts';

describe('sizeSamples', () => {
  it('uses M5/M6/M7 for magnitude, growing like the point sizes', () => {
    const s = sizeSamples('magnitude', 4.5, 7.8);
    expect(s.map((x) => x.label)).toEqual(['M5', 'M6', 'M7']);
    expect(s[0].px).toBeLessThan(s[1].px);
    expect(s[1].px).toBeLessThan(s[2].px);
  });
  it('uses min / middle / max for other columns', () => {
    expect(sizeSamples('revenue', 0, 100).map((x) => x.label)).toEqual(['0', '50', '100']);
  });
});

describe('depthBands', () => {
  it('splits the ramp at 70 and 300 km, widths summing to 100%', () => {
    const b = depthBands(0, 700);
    expect(b.map((x) => x.label)).toEqual(['shallow', 'intermediate', 'deep']);
    expect(b.reduce((n, x) => n + x.pct, 0)).toBeCloseTo(100);
    expect(b[0].pct).toBeCloseTo(10);
  });
});

describe('depthTicks', () => {
  it('depth ticks mark 70 and 300 km between the ends', () => {
    expect(depthTicks(1.4, 653.8).map((t) => t.label)).toEqual(['1', '70', '300', '654 km']);
    expect(depthTicks(0, 100).map((t) => t.label)).toEqual(['0', '70', '100 km']);
  });
});
