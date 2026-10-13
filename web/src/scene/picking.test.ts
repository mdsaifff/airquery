import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pickNearest, pointsWithin } from './picking.ts';
import type { PickInput } from './picking.ts';

const W = 800;
const H = 600;

function setup(points: [number, number, number][]): Omit<PickInput, 'x' | 'y'> {
  const cam = new THREE.PerspectiveCamera(45, W / H, 0.01, 100);
  cam.position.set(0, 0, 3);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  return {
    positions: new Float32Array(points.flat()),
    visible: new Uint8Array(points.length).fill(1),
    viewProj: vp.elements,
    camDist: 3,
    camPos: [0, 0, 3],
    width: W,
    height: H,
    radiusPx: 12,
  };
}

describe('pickNearest', () => {
  it('picks the point under the cursor', () => {
    const s = setup([
      [0, 0, 1], // screen centre
      [0.5, 0, 0.8], // right of centre
    ]);
    expect(pickNearest({ ...s, x: W / 2, y: H / 2 })).toBe(0);
    expect(pickNearest({ ...s, x: W / 2 + 3, y: H / 2 - 2 })).toBe(0);
  });

  it('returns -1 when nothing is within the radius', () => {
    expect(pickNearest({ ...setup([[0, 0, 1]]), x: 10, y: 10 })).toBe(-1);
  });

  it('skips hidden points', () => {
    const s = setup([[0, 0, 1]]);
    s.visible[0] = 0;
    expect(pickNearest({ ...s, x: W / 2, y: H / 2 })).toBe(-1);
  });

  it('prefers a front point over a nearer-on-screen point behind the globe', () => {
    const s = setup([
      [0, 0, -1], // far side, exactly under the cursor
      [0.02, 0, 1], // near side, a few px off
    ]);
    expect(pickNearest({ ...s, x: W / 2, y: H / 2 })).toBe(1);
  });

  it('ignores points behind the camera', () => {
    expect(pickNearest({ ...setup([[0, 0, 5]]), x: W / 2, y: H / 2 })).toBe(-1);
  });

  it('pointsWithin gathers every visible point in the radius, optionally front side only', () => {
    const s = setup([
      [0, 0, 1],
      [0.01, 0, 1],
      [0, 0, -1], // behind
      [0.9, 0, 0.4], // far off on screen
    ]);
    s.radiusPx = 30;
    expect(pointsWithin({ ...s, x: W / 2, y: H / 2 }, true)).toEqual([0, 1]);
    expect(pointsWithin({ ...s, x: W / 2, y: H / 2 }, false)).toEqual([0, 1, 2]);
  });
});
