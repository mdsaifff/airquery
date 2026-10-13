import { describe, expect, it } from 'vitest';
import { rampColor } from './colorRamp.ts';
import { geoToXYZ, radiusAtDepth } from './geo.ts';

describe('geo', () => {
  it('places lat/lon on the unit sphere with lon 0 facing +z and east +x', () => {
    const out = [0, 0, 0];
    geoToXYZ(0, 0, 1, out);
    expect(out.map((v) => +v.toFixed(6))).toEqual([0, 0, 1]);
    geoToXYZ(0, 90, 1, out);
    expect(out.map((v) => +v.toFixed(6))).toEqual([1, 0, 0]);
    geoToXYZ(90, 0, 2, out);
    expect(out.map((v) => +v.toFixed(6))).toEqual([0, 2, 0]);
  });

  it('pushes deeper points inward by the exaggeration factor', () => {
    expect(radiusAtDepth(0, 3)).toBe(1);
    expect(radiusAtDepth(637.1, 3)).toBeCloseTo(0.7);
  });
});

describe('rampColor', () => {
  it('clamps and hits the end stops', () => {
    const lo = [0, 0, 0];
    const hi = [0, 0, 0];
    rampColor(-1, lo);
    rampColor(2, hi);
    expect(lo.map((v) => Math.round(v * 255))).toEqual([0x5c, 0x01, 0xa6]);
    expect(hi.map((v) => Math.round(v * 255))).toEqual([0xf0, 0xf9, 0x21]);
    rampColor(Number.NaN, lo);
    expect(lo.map((v) => Math.round(v * 255))).toEqual([0x5c, 0x01, 0xa6]);
  });
});
