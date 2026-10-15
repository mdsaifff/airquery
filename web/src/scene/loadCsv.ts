// Bring your own CSV: load it into DuckDB, guess the position columns, then build
// a point cloud on the globe once the user confirms the mapping.
import type * as THREE from 'three';
import { config } from '../config.ts';
import type { Columns } from '../data/arrow.ts';
import { datasetName, guessMapping, inferSchema } from '../data/csvSchema.ts';
import type { CsvMapping } from '../data/csvSchema.ts';
import type { Db } from '../data/db.ts';
import { indexIds } from '../data/resultMask.ts';
import { createEarth } from './earth/earth.ts';
import { PointCloud } from './pointCloud.ts';
import { positionsFor } from './positions.ts';
import type { LoadedDataset } from './loadDataset.ts';

export interface CsvImport {
  name: string;
  fileName: string;
  base: Columns;
  numericColumns: string[];
  guess: Partial<CsvMapping>;
}

export async function importCsv(db: Db, file: File): Promise<CsvImport> {
  const name = datasetName(file.name);
  await db.addCsv(name, file, config.csvMaxRows);
  const base = await db.run(`SELECT * FROM ${name}`); // name checked by addCsv
  const numericColumns = [...base.numbers.keys()].filter((c) => !base.timeColumns?.has(c));
  return { name, fileName: file.name, base, numericColumns, guess: guessMapping(base) };
}

export function buildCsvDataset(
  scene: THREE.Scene,
  imp: CsvImport,
  mapping: CsvMapping,
): LoadedDataset {
  const schema = inferSchema(imp.name, imp.fileName, imp.base, mapping);
  const cloud = new PointCloud(scene, positionsFor(schema, imp.base, config.depthExaggeration));
  const earth = createEarth();
  cloud.group.add(earth.group);
  const idIndex = indexIds(imp.base.strings.get('__id') ?? []);
  return {
    schema,
    cloud,
    base: imp.base,
    idIndex,
    mask: new Uint8Array(cloud.count),
    earth,
    shockwaves: null,
  };
}

/** Mean lat/lon of the rows, for flying the camera there. */
export function centroid(base: Columns, m: CsvMapping): { lat: number; lon: number } {
  const lat = base.numbers.get(m.lat) ?? new Float64Array();
  const lon = base.numbers.get(m.lon) ?? new Float64Array();
  let sLat = 0;
  let sLon = 0;
  let n = 0;
  for (let i = 0; i < lat.length; i++) {
    if (Number.isFinite(lat[i]) && Number.isFinite(lon[i])) {
      sLat += lat[i];
      sLon += lon[i];
      n++;
    }
  }
  return n ? { lat: sLat / n, lon: sLon / n } : { lat: 0, lon: 0 };
}
