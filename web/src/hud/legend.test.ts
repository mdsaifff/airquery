import { describe, expect, it } from 'vitest';
import { depthBands, depthTicks, showDepthBands, sizeSamples } from './legend.ts';

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
  it('takes the geometric middle on a log scale, sized like the dots (meteorite mass)', () => {
    const s = sizeSamples('mass_kg', 0.00001, 60000);
    expect(s.map((x) => x.label)).toEqual(['0.00001', '0.775', '60000']);
    expect(s[1].px).toBe(Math.round(6 + 0.5 ** 1.5 * 18));
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

describe('depth bands', () => {
  it('show the earthquake bands only for data deeper than 300 km', () => {
    expect(showDepthBands(1, 654)).toBe(true);
    expect(showDepthBands(1, 6.4)).toBe(false); // deep-sea corals: km, but no 70 / 300 km bands
  });
});
