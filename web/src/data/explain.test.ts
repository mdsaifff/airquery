import { describe, expect, it } from 'vitest';
import type { DatasetSchema } from '../contracts/contracts.ts';
import { explainSentence, firstRow } from './explain.ts';

describe('explainSentence', () => {
  it('summarizes a quake cluster from DuckDB aggregates', () => {
    const row = { n: 47, avg_depth_km: 544.28, max_magnitude: 5.7, mode_place: 'south of the Fiji Islands' }; // prettier-ignore
    expect(explainSentence('quakes', row)).toBe(
      'This cluster has 47 earthquakes, 544 km deep on average, up to magnitude 5.7, mostly south of the Fiji Islands.',
    );
    expect(explainSentence('quakes', { ...row, n: 1, mode_place: 'Japan' })).toBe(
      'This is 1 earthquake, 544 km deep on average, up to magnitude 5.7, mostly near Japan.',
    );
  });

  it('summarizes papers and handles empty selections', () => {
    expect(
      explainSentence('papers', { n: 230, mode_field: 'vision', min_year: 2019, max_year: 2025 }),
    ).toBe('This region has 230 papers, mostly vision, from 2019 to 2025.');
    expect(explainSentence('quakes', { n: 0 })).toBe('There are no visible points there.');
    expect(explainSentence('other', { n: 3 })).toBe('3 points selected.');
  });

  it('reads the first row of a result', () => {
    const row = firstRow({ numRows: 1, numbers: new Map([['n', new Float64Array([5])]]), strings: new Map([['mode_place', ['Chile']]]) }); // prettier-ignore
    expect(row).toEqual({ n: 5, mode_place: 'Chile' });
  });

  it('summarizes any other dataset from its noun, top category and main numbers', () => {
    const storms = {
      dataset: 'hurricanes',
      noun: 'storm positions',
      default_size_by: 'wind_kt',
      default_color_by: 'wind_kt',
      position: { kind: 'geo', lat: 'lat', lon: 'lon' },
      columns: [
        { name: 'basin', type: 'text', categorical: true },
        { name: 'storm', type: 'text', examples: ['MILTON'] },
        { name: 'wind_kt', type: 'number', unit: 'knots' },
        { name: 'lat', type: 'number', unit: 'degrees' },
      ],
    } as unknown as DatasetSchema;
    const row = { n: 12, mode_basin: 'North Atlantic', mode_storm: 'MILTON', min_wind_kt: 35, max_wind_kt: 150.4, avg_lat: 25 }; // prettier-ignore
    expect(explainSentence('hurricanes', row, storms)).toBe(
      'This area has 12 storm positions, mostly North Atlantic, wind 35 to 150 knots.',
    );
    expect(explainSentence('hurricanes', { ...row, n: 1 }, storms)).toBe(
      'This area has 1 storm position, mostly North Atlantic, wind 35 to 150 knots.',
    );
  });
});
