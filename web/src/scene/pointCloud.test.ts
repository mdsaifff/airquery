import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PointCloud } from './pointCloud.ts';

const depth = new Float32Array([0, 0, 0.5, 0, 0.8, 0]);
const surface = new Float32Array([0, 0, 1, 0, 1, 0]);

describe('PointCloud depth mix', () => {
  it('starts on the surface and setDepthMix blends the CPU positions used by picking', () => {
    const c = new PointCloud(new THREE.Scene(), depth, 0.6, surface);
    expect([...c.positions]).toEqual([...surface]);
    c.setDepthMix(0.5);
    expect(c.positions[2]).toBeCloseTo(0.75);
    expect(c.positions[4]).toBeCloseTo(0.9);
    c.setDepthMix(1);
    expect([...c.positions]).toEqual([...depth]);
  });

  it('a cloud without surface positions ignores the depth mix', () => {
    const c = new PointCloud(new THREE.Scene(), depth);
    c.setDepthMix(1);
    expect([...c.positions]).toEqual([...depth]);
    expect(c.surfacePositions).toBe(c.depthPositions);
  });
});
describe('PointCloud time glow', () => {
  it('stores days since t0 per point and switches the glow with the playhead', () => {
    const c = new PointCloud(new THREE.Scene(), depth);
    const day = 86_400_000;
    c.setTimes([0, day * 2], 0);
    expect([...c.times]).toEqual([0, 2]);
    c.setPlayhead(1.5, 3);
    expect(c.timeUniforms).toEqual({ on: 1, playhead: 1.5, glowDays: 3 });
    c.setPlayhead(null, 3);
    expect(c.timeUniforms.on).toBe(0);
  });
});
