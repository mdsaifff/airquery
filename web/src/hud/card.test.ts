import { describe, expect, it } from 'vitest';
import type { DatasetSchema } from '../contracts/contracts.ts';
import { cardFor } from './card.ts';
import { depthClass, magnitudeClass } from './quakeClass.ts';

const quakes = { dataset: 'quakes', table: 'quakes', description: '', id: 'id', position: { kind: 'geo', lat: 'lat', lon: 'lon', depth: 'depth_km' }, columns: [] } as unknown as DatasetSchema; // prettier-ignore
const quakeBase = {
  numRows: 1,
  numbers: new Map([
    ['magnitude', new Float64Array([6.4])],
    ['depth_km', new Float64Array([216])],
    ['time', new Float64Array([Date.UTC(2024, 2, 3, 14, 22)])],
    ['lat', new Float64Array([-15.512])],
    ['lon', new Float64Array([167.204])],
  ]),
  strings: new Map([['place', ['<img src=x onerror=alert(1)> Vanuatu']]]),
};

describe('quake classes', () => {
  it('follows the USGS magnitude classes', () => {
    expect([3.9, 4, 5.2, 6.4, 7.1, 8.2].map(magnitudeClass)).toEqual(['Minor', 'Light', 'Moderate', 'Strong', 'Major', 'Great']); // prettier-ignore
  });
  it('splits depth at 70 and 300 km', () => {
    expect([10, 70, 300, 301].map(depthClass)).toEqual(['Shallow', 'Intermediate', 'Intermediate', 'Deep']); // prettier-ignore
  });
});

describe('cardFor', () => {
  it('quake card: magnitude badge, depth gauge, UTC date and time, coordinates', () => {
    const c = cardFor(quakes, quakeBase as never, 0);
    expect(c.badge).toEqual({ value: 'M6.4', label: 'Strong' });
    expect(c.gauge?.label).toBe('216 km deep · Intermediate');
    expect(c.gauge?.pct).toBeCloseTo((216 / 700) * 100);
    expect(c.rows).toEqual([
      ['Date', 'Mar 3, 2024'],
      ['Time', '14:22 UTC'],
      ['Location', '-15.51°, 167.20°'],
    ]);
  });

  it('cards pass strings through unchanged (the renderer uses textContent)', () => {
    expect(cardFor(quakes, quakeBase as never, 0).title).toBe(
      '<img src=x onerror=alert(1)> Vanuatu',
    );
  });

  it("generic card shows the dataset's own columns", () => {
    const csv = { dataset: 'user_shops', table: 'user_shops', description: '', id: '__id', position: { kind: 'geo', lat: 'lat', lon: 'lng' }, columns: [{ name: 'name', type: 'text' }, { name: 'lat', type: 'number' }, { name: 'lng', type: 'number' }, { name: 'revenue', type: 'number' }] } as unknown as DatasetSchema; // prettier-ignore
    const base = {
      numRows: 1,
      numbers: new Map([['lat', new Float64Array([51.5])], ['lng', new Float64Array([-0.12])], ['revenue', new Float64Array([1234.5])]]), // prettier-ignore
      strings: new Map([
        ['name', ['Corner Shop']],
        ['__id', ['0']],
      ]),
    };
    const c = cardFor(csv, base as never, 0);
    expect(c.title).toBe('Corner Shop');
    expect(c.badge).toBeNull();
    expect(c.rows).toContainEqual(['revenue', '1,234.5']);
  });
});
