// Opens DuckDB, loads the quakes table once, and builds the globe from it.
import { numbers, range } from '../data/arrow.ts';
import type { Columns } from '../data/arrow.ts';
import { Db } from '../data/db.ts';
import { indexIds } from '../data/resultMask.ts';
import { GlobeScene } from './globeScene.ts';
import type { Polylines } from './globeScene.ts';
import type * as THREE from 'three';
import type { DatasetSchema } from '../contracts/contracts.ts';

export interface LoadedGlobe {
  db: Db;
  globe: GlobeScene;
  /** Every row, in point order; encodings and tooltips read from here. */
  base: Columns;
  idIndex: Map<string, number>;
  schema: DatasetSchema;
}

const BASE_QUERY = 'SELECT * FROM quakes';

async function fetchCoastlines(): Promise<Polylines | null> {
  try {
    const res = await fetch(new URL('data/coastlines.json', document.baseURI));
    return ((await res.json()) as { lines: Polylines }).lines;
  } catch {
    return null; // the globe still works without them
  }
}

async function fetchSchema(dataset: string): Promise<DatasetSchema> {
  const res = await fetch(new URL(`data/${dataset}.schema.json`, document.baseURI));
  if (!res.ok) throw new Error(`schema ${dataset}: HTTP ${res.status}`);
  return (await res.json()) as DatasetSchema;
}

export async function loadGlobe(scene: THREE.Scene): Promise<LoadedGlobe> {
  const [db, coastlines, schema] = await Promise.all([
    Db.open(['quakes']),
    fetchCoastlines(),
    fetchSchema('quakes'),
  ]);
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
  return { db, globe, base, schema, idIndex: indexIds(base.strings.get(schema.id ?? 'id') ?? []) };
}
