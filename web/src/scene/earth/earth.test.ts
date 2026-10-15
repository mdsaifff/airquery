import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { geoToXYZ } from '../geo.ts';
import { createEarth, EARTH_ROTATION_Y } from './earth.ts';

/** Position of the sphere vertex nearest to texture coordinate (u, v), after the Earth's rotation. */
function vertexAtUv(u: number, v: number): THREE.Vector3 {
  const g = new THREE.SphereGeometry(1, 72, 36);
  g.rotateY(EARTH_ROTATION_Y);
  const uv = g.getAttribute('uv');
  const pos = g.getAttribute('position');
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < uv.count; i++) {
    const d = Math.hypot(uv.getX(i) - u, uv.getY(i) - v);
    if (d < bestD) [best, bestD] = [i, d];
  }
  return new THREE.Vector3().fromBufferAttribute(pos, best);
}

describe('Earth texture alignment', () => {
  it.each([
    [0.5, 0], // Greenwich
    [0.75, 90], // 90°E
    [0.25, -90], // 90°W
  ])('u=%s lands on lon %s', (u, lon) => {
    const expected: number[] = [0, 0, 0];
    geoToXYZ(0, lon, 1, expected);
    const p = vertexAtUv(u, 0.5);
    expect(p.distanceTo(new THREE.Vector3(...expected))).toBeLessThan(0.05);
  });
});

describe('createEarth', () => {
  it('builds and stays usable without textures (no DOM here: loading fails quietly)', async () => {
    const earth = createEarth('high');
    earth.setXray(0.5);
    earth.update(new THREE.Vector3(0, 0, 1), 16);
    await new Promise((r) => setTimeout(r, 0));
    const meshes = earth.group.children.filter((c) => c instanceof THREE.Mesh);
    expect(meshes.length).toBe(3); // crust, clouds, atmosphere
  });
});
