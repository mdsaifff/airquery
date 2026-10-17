import { describe, expect, it } from 'vitest';
import { hereBox, inBox, rayToLatLon } from './here.ts';

describe('here', () => {
  it('a ray hitting the unit globe gives the lat/lon of the near side', () => {
    const p = rayToLatLon([0, 0, 3], [0, 0, -1]); // straight at lon 0 from +z
    expect(p?.lat).toBeCloseTo(0);
    expect(p?.lon).toBeCloseTo(0);
    const east = rayToLatLon([3, 0, 0], [-1, 0, 0]); // from +x: lon 90
    expect(east?.lon).toBeCloseTo(90);
    const north = rayToLatLon([0, 3, 0], [0, -1, 0]);
    expect(north?.lat).toBeCloseTo(90);
  });

  it('a ray that misses the globe is null', () => {
    expect(rayToLatLon([0, 2, 3], [0, 0, -1])).toBeNull();
  });

  it('the box around here is clamped to the map', () => {
    expect(hereBox({ lat: 36, lon: 138 }, 7.5)).toEqual({ lat: [28.5, 43.5], lon: [130.5, 145.5] });
    expect(hereBox({ lat: 88, lon: 178 }, 7.5)).toEqual({ lat: [80.5, 90], lon: [170.5, 180] });
  });

  it('inBox keeps visible points inside the box', () => {
    const lats = [35, 36, 10, 37];
    const lons = [139, 140, 140, 139];
    const visible = Uint8Array.from([1, 1, 1, 0]);
    expect(inBox(lats, lons, visible, { lat: [30, 40], lon: [135, 145] })).toEqual([0, 1]);
  });
});
