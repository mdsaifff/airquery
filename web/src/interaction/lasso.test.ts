import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pointInPolygon, pointsInPolygon } from '../scene/picking.ts';
import { area, LassoPath } from './lasso.ts';

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('lasso', () => {
  it('collects spaced points and closes into a polygon', () => {
    const l = new LassoPath(5);
    l.add(1, 1); // not drawing yet
    l.start();
    for (const p of [...square, { x: 1, y: 1 }, { x: 2, y: 2 }]) l.add(p.x, p.y);
    expect(l.points).toHaveLength(5); // (2,2) too close to (1,1)
    expect(l.finish()).toHaveLength(5);
    expect(l.active).toBe(false);
  });

  it('rejects scribbles that enclose nothing', () => {
    const l = new LassoPath(1);
    l.start();
    l.add(0, 0);
    l.add(50, 0);
    l.add(100, 1);
    expect(l.finish()).toBeNull();
    expect(Math.abs(area(square))).toBe(10_000);
  });

  it('point-in-polygon, including a concave loop', () => {
    expect(pointInPolygon(50, 50, square)).toBe(true);
    expect(pointInPolygon(150, 50, square)).toBe(false);
    const u = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 70 }, { x: 70, y: 70 }, { x: 70, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]; // prettier-ignore
    expect(pointInPolygon(50, 30, u)).toBe(false); // inside the notch
    expect(pointInPolygon(50, 85, u)).toBe(true);
  });

  it('selects the visible projected points inside the loop', () => {
    const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    cam.position.set(0, 0, 3);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const input = {
      positions: new Float32Array([0, 0, 1, 0.5, 0.5, 0.9, 0, 0, -1, 0.02, 0, 1]),
      visible: new Uint8Array([1, 1, 1, 0]),
      viewProj: vp.elements,
      camDist: 3,
      camPos: [0, 0, 3] as [number, number, number],
      width: 400,
      height: 400,
    };
    const around = [{ x: 180, y: 180 }, { x: 220, y: 180 }, { x: 220, y: 220 }, { x: 180, y: 220 }]; // prettier-ignore
    expect(pointsInPolygon(input, around, true)).toEqual([0]); // 2 is behind, 3 hidden
    expect(pointsInPolygon(input, around, false)).toEqual([0, 2]);
  });
});
