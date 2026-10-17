import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { config } from '../config.ts';
import type { DatasetSchema } from '../contracts/contracts.ts';
import type { Columns } from '../data/arrow.ts';
import { applyView } from './applyView.ts';
import { PointCloud } from './pointCloud.ts';
import { positionsFor, surfacePositionsFor } from './positions.ts';

const papers: DatasetSchema = {
  dataset: 'papers',
  table: 'papers',
  description: 't',
  position: { kind: 'xyz', x: 'x', y: 'y', z: 'z' },
  columns: [
    { name: 'year', type: 'number', min: 2019, max: 2025 },
    { name: 'field', type: 'text', categorical: true, examples: ['vision', 'language', 'machine learning', 'robots'] }, // prettier-ignore
  ],
  default_color_by: 'field',
};

const base: Columns = {
  numRows: 3,
  numbers: new Map([
    ['x', new Float64Array([0.1, -0.5, 1])],
    ['y', new Float64Array([0, 0.2, 0])],
    ['z', new Float64Array([0.3, 0, -1])],
    ['year', new Float64Array([2019, 2023, 2025])],
  ]),
  strings: new Map([
    ['id', ['a', 'b', 'c']],
    ['field', ['vision', 'robots', 'language']],
  ]),
};

describe('positionsFor', () => {
  it('copies xyz positions straight through', () => {
    expect(Array.from(positionsFor(papers, base, 3)).map((v) => +v.toFixed(3))).toEqual([
      0.1, 0, 0.3, -0.5, 0.2, 0, 1, 0, -1,
    ]);
  });
});

describe('categorical colour', () => {
  it('gives each category its own palette slot (up to 8; beyond that, grey "other")', () => {
    const cloud = new PointCloud(new THREE.Scene(), positionsFor(papers, base, 3));
    const { legend } = applyView(cloud, base, papers, new Map(), new Uint8Array(3), {
      result: null,
      colorBy: null,
      sizeBy: null,
    });
    expect(legend).toEqual({
      kind: 'categories',
      column: 'field',
      items: [
        { label: 'vision', color: '#3987e5' },
        { label: 'language', color: '#d95926' },
        { label: 'machine learning', color: '#199e70' },
        { label: 'robots', color: '#e6b800' },
      ],
    });
    const colors = cloud['geometry'].getAttribute('aColor').array as Float32Array;
    const hex = (i: number) =>
      '#' + [0, 1, 2].map((c) => Math.round(colors[i * 3 + c] * 255).toString(16).padStart(2, '0')).join(''); // prettier-ignore
    expect([hex(0), hex(1), hex(2)]).toEqual(['#3987e5', '#e6b800', '#d95926']);
  });
});

describe('surfacePositionsFor', () => {
  const geo = {
    dataset: 'q',
    table: 'q',
    description: '',
    id: 'id',
    position: { kind: 'geo' as const, lat: 'lat', lon: 'lon', depth: 'depth_km' },
    columns: [],
  };
  const base = {
    numRows: 1,
    numbers: new Map([
      ['lat', new Float64Array([0])],
      ['lon', new Float64Array([90])],
      ['depth_km', new Float64Array([300])],
    ]),
    strings: new Map(),
  };

  it('lifts geo points with depth to the given radius', () => {
    const p = surfacePositionsFor(geo as never, base as never, 1.004);
    if (!p) throw new Error('expected surface positions');
    expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(1.004, 6);
    expect(p[0]).toBeCloseTo(1.004, 6); // lon 90 is +x
  });

  it('is null without a depth column or for xyz layouts', () => {
    expect(surfacePositionsFor({ ...geo, position: { kind: 'geo', lat: 'lat', lon: 'lon' } } as never, base as never, 1)).toBeNull(); // prettier-ignore
    expect(surfacePositionsFor({ ...geo, position: { kind: 'xyz', x: 'x', y: 'y', z: 'z' } } as never, base as never, 1)).toBeNull(); // prettier-ignore
  });
});

describe('positionsFor without a depth column', () => {
  it('lifts geo points to the surface radius so the solid crust does not clip them', () => {
    const csv = {
      dataset: 'user_x',
      table: 'user_x',
      description: '',
      id: '__id',
      position: { kind: 'geo' as const, lat: 'lat', lon: 'lon' },
      columns: [],
    };
    const base = { numRows: 1, numbers: new Map([['lat', new Float64Array([10])], ['lon', new Float64Array([20])]]), strings: new Map() }; // prettier-ignore
    const p = positionsFor(csv as never, base as never, 3);
    expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(config.surfaceRadius, 6);
  });
});
