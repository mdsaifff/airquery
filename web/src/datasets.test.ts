import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Db } from './data/db.ts';
import type { SessionDeps } from './data/querySession.ts';
import { Datasets } from './datasets.ts';

describe('Datasets', () => {
  it('a removed scene is left out of the scene order', () => {
    const d = new Datasets(['quakes', 'papers'], {} as THREE.Scene, new Promise<Db>(() => {}), () => ({}) as SessionDeps); // prettier-ignore
    d.remove('papers');
    expect(d.neighbour('left')).toBe('quakes');
    expect(d.neighbour('right')).toBe('quakes');
  });
});
