// Opens DuckDB, loads the quakes table once, and builds the globe from it.
import type { Columns } from '../data/arrow.ts';
import { Db } from '../data/db.ts';
import { indexIds } from '../data/resultMask.ts';
import { GlobeScene } from './globeScene.ts';
import type { Polylines } from './globeScene.ts';
import type * as THREE from 'three';

export interface LoadedGlobe {
  db: Db;
  globe: GlobeScene;
  /** Every row, in point order; encodings and tooltips read from here. */
  base: Columns;
  idIndex: Map<string, number>;
}

const BASE_QUERY = 'SELECT * FROM quakes';

export function numbers(cols: Columns, name: string): Float64Array {
  const col = cols.numbers.get(name);
  if (!col) throw new Error(`missing column ${name}`);
  return col;
}

export function range(values: ArrayLike<number>): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < lo) lo = values[i];
    if (values[i] > hi) hi = values[i];
  }
  return [lo, hi];
}

async function fetchCoastlines(): Promise<Polylines | null> {
  try {
    const res = await fetch(new URL('data/coastlines.json', document.baseURI));
    return ((await res.json()) as { lines: Polylines }).lines;
  } catch {
    return null; // the globe still works without them
  }
}

export async function loadGlobe(scene: THREE.Scene): Promise<LoadedGlobe> {
  const [db, coastlines] = await Promise.all([Db.open(['quakes']), fetchCoastlines()]);
  const base = await db.run(BASE_QUERY);
  const depth = numbers(base, 'depth_km');
  const mag = numbers(base, 'magnitude');
  const globe = new GlobeScene(
    scene,
    { lat: numbers(base, 'lat'), lon: numbers(base, 'lon'), depthKm: depth },
    coastlines,
  );
  globe.setColors(depth, ...range(depth));
  globe.setSizes(mag, ...range(mag));
  return { db, globe, base, idIndex: indexIds(base.strings.get('id') ?? []) };
}
