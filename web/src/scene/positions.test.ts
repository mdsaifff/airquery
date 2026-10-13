import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { DatasetSchema } from '../contracts/contracts.ts';
import type { Columns } from '../data/arrow.ts';
import { applyView } from './applyView.ts';
import { PointCloud } from './pointCloud.ts';
import { positionsFor } from './positions.ts';

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
  it('gives the first three categories palette slots and folds the rest to grey', () => {
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
        { label: 'other', color: '#6b7280' },
      ],
    });
    const colors = cloud['geometry'].getAttribute('aColor').array as Float32Array;
    const hex = (i: number) =>
      '#' + [0, 1, 2].map((c) => Math.round(colors[i * 3 + c] * 255).toString(16).padStart(2, '0')).join(''); // prettier-ignore
    expect([hex(0), hex(1), hex(2)]).toEqual(['#3987e5', '#6b7280', '#d95926']);
  });
});
