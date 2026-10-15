// Loads one dataset into DuckDB and builds its point cloud (plus the globe for geo data).
import type * as THREE from 'three';
import { config } from '../config.ts';
import type { DatasetSchema } from '../contracts/contracts.ts';
import type { Columns } from '../data/arrow.ts';
import type { Db } from '../data/db.ts';
import { indexIds } from '../data/resultMask.ts';
import { createEarth } from './earth/earth.ts';
import type { Earth } from './earth/earth.ts';
import { PointCloud } from './pointCloud.ts';
import { positionsFor } from './positions.ts';

export interface LoadedDataset {
  schema: DatasetSchema;
  cloud: PointCloud;
  /** Every row, in point order; encodings and tooltips read from here. */
  base: Columns;
  idIndex: Map<string, number>;
  /** Reused visibility mask for query results. */
  mask: Uint8Array;
  /** The realistic globe, for geo datasets. */
  earth: Earth | null;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, document.baseURI));
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
    throw new Error(`${path}: not found`);
  }
  return (await res.json()) as T;
}

/** Throws if the dataset's files are missing (e.g. the galaxy was never built). */
export async function loadDataset(
  db: Db,
  scene: THREE.Scene,
  name: string,
): Promise<LoadedDataset> {
  const schema = await fetchJson<DatasetSchema>(`data/${name}.schema.json`);
  await db.addDataset(name);
  const base = await db.run(`SELECT * FROM ${name}`); // name checked by addDataset
  const geo = schema.position.kind === 'geo';
  const cloud = new PointCloud(scene, positionsFor(schema, base, config.depthExaggeration), geo ? config.farSideDim : config.farSideDim / 2); // prettier-ignore
  const earth = geo ? createEarth() : null;
  if (earth) cloud.group.add(earth.group);
  const idIndex = indexIds(base.strings.get(schema.id ?? 'id') ?? []);
  return { schema, cloud, base, idIndex, mask: new Uint8Array(cloud.count), earth };
}
