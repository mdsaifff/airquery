import { describe, expect, it } from 'vitest';
import type { Columns } from './arrow.ts';
import { datasetName, guessMapping, inferSchema } from './csvSchema.ts';

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

const cols: Columns = {
  numRows: 4,
  numbers: new Map([
    ['latitude', new Float64Array([40.7, 40.8, 40.6, 40.75])],
    ['longitude', new Float64Array([-74, -73.9, -74.1, -73.95])],
    ['price', new Float64Array([80, 250, 45, 900])],
    ['last_review', new Float64Array([day('2024-01-02'), day('2024-06-30'), day('2023-03-01'), day('2024-02-01')])], // prettier-ignore
  ]),
  strings: new Map([
    ['__id', ['1', '2', '3', '4']],
    ['room_type', ['Entire home/apt', 'Private room', 'Private room', 'Shared room']],
    ['name', ['Cozy loft', 'Sunny room', 'Tiny nook', 'Penthouse']],
  ]),
  timeColumns: new Set(['last_review']),
};

describe('CSV schema inference', () => {
  it('names the dataset safely', () => {
    expect(datasetName('Airbnb listings (NYC).csv')).toBe('user_airbnb_listings_nyc');
    expect(datasetName('...csv')).toBe('user_data');
  });

  it('guesses lat/lon columns', () => {
    expect(guessMapping(cols)).toEqual({ lat: 'latitude', lon: 'longitude', height: null });
  });

  it('infers types, ranges, examples and the position', () => {
    const mapping = { lat: 'latitude', lon: 'longitude', height: 'price' };
    const s = inferSchema('user_nyc', 'nyc.csv', cols, mapping);
    expect(s.position).toEqual({
      kind: 'geo',
      lat: 'latitude',
      lon: 'longitude',
      depth: null,
      height: 'price',
    });
    expect(s.id).toBe('__id');
    const byName = Object.fromEntries(s.columns.map((c) => [c.name, c]));
    expect(Object.keys(byName).sort()).toEqual(['last_review', 'name', 'price', 'room_type']);
    expect(byName.price).toEqual({ name: 'price', type: 'number', min: 45, max: 900 });
    expect(byName.last_review).toEqual({
      name: 'last_review',
      type: 'timestamp',
      min: '2023-03-01T00:00:00',
      max: '2024-06-30T00:00:00',
    });
    expect(byName.room_type.examples?.[0]).toBe('Private room');
    expect(byName.room_type.categorical).toBe(true);
    expect(s.default_color_by).toBe('price');
  });
});
