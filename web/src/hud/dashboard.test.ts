import { describe, expect, it } from 'vitest';
import type { DatasetSchema } from '../contracts/contracts.ts';
import type { Columns } from '../data/arrow.ts';
import {
  bands, byMonth, computeDashboard, filterFor, histogram, niceWidth, region, topRegions,
} from './dashboard.ts'; // prettier-ignore
import type { Chart } from './dashboard.ts';

const all = (n: number) => new Uint8Array(n).fill(1);

describe('dashboard maths', () => {
  it('histogram bins by width, honours the mask, puts the max in the last bin', () => {
    const v = [4.5, 4.9, 5.2, 7.5, 6.1];
    const mask = Uint8Array.from([1, 1, 1, 1, 0]);
    const bars = histogram(v, mask, 4.5, 7.5, 0.5);
    expect(bars.map((b) => b.count)).toEqual([2, 1, 0, 0, 0, 1]);
    expect(bars[0]).toMatchObject({ lo: 4.5, hi: 5, closed: false });
    expect(bars[5]).toMatchObject({ lo: 7, hi: 7.5, closed: true });
  });

  it('niceWidth picks 1/2/5 steps', () => {
    expect(niceWidth(3, 6)).toBe(0.5);
    expect(niceWidth(650, 8)).toBe(100);
  });

  it('bands count depth ranges with an open last band', () => {
    const bars = bands([10, 80, 320, 640], all(4), [0, 70, 300], 653);
    expect(bars.map((b) => [b.label, b.count])).toEqual([
      ['0–70', 1],
      ['70–300', 1],
      ['300+', 2],
    ]);
    expect(bars[2]).toMatchObject({ lo: 300, hi: 653, closed: true });
  });

  it('byMonth counts per month of one year and refuses multi-year data', () => {
    const t = [Date.UTC(2024, 0, 5), Date.UTC(2024, 0, 9), Date.UTC(2024, 11, 31)];
    const bars = byMonth(t, all(3));
    expect(bars?.map((b) => b.count)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(bars?.[11]).toMatchObject({ label: 'Dec', lo: Date.UTC(2024, 11, 1), closed: true });
    expect(byMonth([Date.UTC(2023, 5, 1), Date.UTC(2024, 5, 1)], all(2))).toBeNull();
  });

  it('regions are the text after the last comma; top regions are ranked', () => {
    expect(region('41 km ESE of San Pedro de Atacama, Chile')).toBe('Chile');
    expect(region('south of the Fiji Islands')).toBe('south of the Fiji Islands');
    const places = ['a, Japan', 'b, Japan', 'c, Chile', 'null', 'd, Japan'];
    const mask = Uint8Array.from([1, 1, 1, 1, 0]);
    expect(topRegions(places, mask, 5).map((b) => [b.label, b.count])).toEqual([
      ['Japan', 2],
      ['Chile', 1],
    ]);
  });

  it('turns a clicked bar into a filter', () => {
    const range: Chart = {
      key: 'size',
      title: 'Magnitude',
      field: 'magnitude',
      kind: 'range',
      bars: [],
    };
    expect(filterFor(range, { label: '5', count: 1, lo: 5, hi: 5.5, closed: false })).toEqual({
      field: 'magnitude',
      op: 'between',
      value: [5, 5.499],
    });
    const time: Chart = { ...range, key: 'time', field: 'time', kind: 'time' };
    const mar = { label: 'Mar', count: 1, lo: Date.UTC(2024, 2, 1), hi: Date.UTC(2024, 3, 1) - 1000, closed: true }; // prettier-ignore
    expect(filterFor(time, mar).value).toEqual(['2024-03-01T00:00:00', '2024-03-31T23:59:59']);
    const text: Chart = { ...range, key: 'text', field: 'place', kind: 'text' };
    expect(filterFor(text, { label: 'Japan', count: 2, lo: 0, hi: 0, closed: true })).toEqual({
      field: 'place',
      op: 'contains',
      value: 'Japan',
    });
  });
});

const quakeSchema = {
  dataset: 'quakes',
  table: 'quakes',
  description: '',
  id: 'id',
  row_count: 3,
  position: { kind: 'geo', lat: 'lat', lon: 'lon', depth: 'depth_km' },
  default_color_by: 'depth_km',
  default_size_by: 'magnitude',
  columns: [
    { name: 'time', type: 'timestamp' },
    { name: 'depth_km', type: 'number' },
    { name: 'magnitude', type: 'number' },
    { name: 'place', type: 'text' },
  ],
} as unknown as DatasetSchema;

const quakeCols: Columns = {
  numRows: 3,
  numbers: new Map([
    ['time', new Float64Array([Date.UTC(2024, 0, 1), Date.UTC(2024, 1, 1), Date.UTC(2024, 1, 2)])],
    ['depth_km', new Float64Array([10, 400, 600])],
    ['magnitude', new Float64Array([5, 6.5, 7])],
  ]),
  strings: new Map([['place', ['x, Japan', 'y, Tonga', 'z, Tonga']]]),
  timeColumns: new Set(['time']),
};

describe('computeDashboard', () => {
  it('builds magnitude, depth, month and region charts plus a summary', () => {
    const d = computeDashboard(quakeSchema, quakeCols, Uint8Array.from([1, 1, 0]));
    expect(d.charts.map((c) => c.key)).toEqual(['size', 'depth', 'time', 'text']);
    expect(d).toMatchObject({ count: 2, maxSize: 6.5, medianDepth: 205 });
  });

  it('a dataset without time or place gets only histograms', () => {
    const schema = {
      ...quakeSchema,
      position: { kind: 'geo', lat: 'lat', lon: 'lon' },
      default_color_by: 'magnitude',
      columns: [{ name: 'magnitude', type: 'number' }],
    } as unknown as DatasetSchema;
    const cols: Columns = { numRows: 3, numbers: new Map([['magnitude', new Float64Array([1, 2, 3])]]), strings: new Map() }; // prettier-ignore
    const d = computeDashboard(schema, cols, all(3));
    expect(d.charts.map((c) => c.key)).toEqual(['size']);
    expect(d.medianDepth).toBeNull();
  });
});
