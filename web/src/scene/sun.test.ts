import { describe, expect, it } from 'vitest';
import { subsolarPoint, sunDirection } from './sun.ts';

describe('subsolarPoint', () => {
  it('is over the equator near Greenwich at the March equinox, noon UTC', () => {
    const p = subsolarPoint(new Date('2024-03-20T12:00:00Z'));
    expect(Math.abs(p.lat)).toBeLessThan(1);
    expect(Math.abs(p.lon)).toBeLessThan(5);
  });

  it('reaches the tropics at the solstices', () => {
    expect(subsolarPoint(new Date('2024-06-20T12:00:00Z')).lat).toBeCloseTo(23.4, 0);
    const dec = subsolarPoint(new Date('2024-12-21T00:00:00Z'));
    expect(dec.lat).toBeCloseTo(-23.4, 0);
    expect(Math.abs(dec.lon)).toBeGreaterThan(175); // midnight UTC: sun over the date line
  });
});

describe('sunDirection', () => {
  it('is a unit vector pointing at lon 0 (+z) at the equinox noon', () => {
    const [x, y, z] = sunDirection(new Date('2024-03-20T12:00:00Z'));
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
    expect(z).toBeGreaterThan(0.99);
  });
});
