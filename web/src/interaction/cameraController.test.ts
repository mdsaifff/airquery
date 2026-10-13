import { describe, expect, it } from 'vitest';
import { CameraController, orbitPosition } from './cameraController.ts';
import type { CameraOptions } from './cameraController.ts';

const opts: CameraOptions = {
  rotateRadPerPx: 0.01,
  dampingHalfLifeMs: 100,
  distanceMin: 1.5,
  distanceMax: 6,
  pitchLimit: 1.4,
  autoSpinRadPerSec: 0.1,
  autoSpinIdleMs: 1000,
  animMs: 500,
  flyToDistance: 2,
};
const home = { yaw: 0, pitch: 0, distance: 3 };
const make = () => new CameraController(opts, home);

describe('CameraController', () => {
  it('drag right turns the camera west so the globe follows the hand', () => {
    const c = make();
    c.update(1);
    c.beginDrag(1);
    c.rotateBy(10, 0, 17);
    expect(c.orbit.yaw).toBeCloseTo(-0.1);
    c.rotateBy(0, 10, 33);
    expect(c.orbit.pitch).toBeCloseTo(0.1);
  });

  it('clamps pitch', () => {
    const c = make();
    c.beginDrag(0);
    c.rotateBy(0, 10_000, 16);
    expect(c.orbit.pitch).toBe(opts.pitchLimit);
  });

  it('keeps spinning after release and damps to a stop', () => {
    const c = new CameraController({ ...opts, autoSpinIdleMs: 1e9 }, home);
    c.update(1);
    c.beginDrag(1);
    for (let t = 17; t <= 97; t += 16) c.rotateBy(10, 0, t);
    c.endDrag(97);
    const atRelease = c.orbit.yaw;
    c.update(113);
    const afterOne = c.orbit.yaw;
    expect(afterOne).toBeLessThan(atRelease); // still moving the same way
    for (let t = 129; t < 2000; t += 16) c.update(t);
    const settled = c.orbit.yaw;
    c.update(2016);
    expect(Math.abs(c.orbit.yaw - settled)).toBeLessThan(1e-4);
  });

  it('does not fling if the hand was held still before release', () => {
    const c = make();
    c.update(1);
    c.beginDrag(1);
    c.rotateBy(10, 0, 17);
    c.endDrag(400);
    const y = c.orbit.yaw;
    c.update(416);
    expect(c.orbit.yaw).toBe(y);
  });

  it('dolly zooms in for scale > 1 and clamps', () => {
    const c = make();
    c.dollyBy(1.5, 0);
    expect(c.orbit.distance).toBeCloseTo(2);
    c.dollyBy(100, 0);
    expect(c.orbit.distance).toBe(opts.distanceMin);
    c.dollyBy(0.001, 0);
    expect(c.orbit.distance).toBe(opts.distanceMax);
  });

  it('ignores input while frozen (clutch)', () => {
    const c = make();
    c.setFrozen(true, 0);
    c.beginDrag(0);
    c.rotateBy(100, 100, 16);
    c.dollyBy(2, 16);
    expect(c.orbit).toEqual(home);
  });

  it('animates reset back home', () => {
    const c = make();
    c.update(1);
    c.beginDrag(1);
    c.rotateBy(50, 30, 17);
    c.endDrag(500);
    c.reset(500);
    c.update(750);
    expect(c.animating).toBe(true);
    c.update(1001);
    expect(c.animating).toBe(false);
    expect(c.orbit.yaw).toBeCloseTo(0);
    expect(c.orbit.pitch).toBeCloseTo(0);
  });

  it('flies to a lat/lon the short way round and gets closer', () => {
    const c = make();
    c.orbit.yaw = (170 * Math.PI) / 180;
    c.update(1);
    c.flyTo(-33, -170, 1);
    c.update(251);
    // halfway: crossed the antimeridian (|yaw| near 180°) instead of sweeping through 0
    expect(Math.abs(Math.cos(c.orbit.yaw))).toBeGreaterThan(0.98);
    c.update(600);
    expect(Math.cos(c.orbit.yaw - (-170 * Math.PI) / 180)).toBeCloseTo(1);
    expect(c.orbit.pitch).toBeCloseTo((-33 * Math.PI) / 180);
    expect(c.orbit.distance).toBe(2);
  });

  it('spins slowly from the start, pauses after input, resumes when idle', () => {
    const c = make();
    c.update(1);
    c.update(1001);
    expect(c.orbit.yaw).toBeCloseTo(0.1);
    c.dollyBy(1, 1001); // any input
    c.update(1501);
    expect(c.orbit.yaw).toBeCloseTo(0.1);
    c.update(2001); // idle for exactly autoSpinIdleMs: not yet
    expect(c.orbit.yaw).toBeCloseTo(0.1);
    c.update(3001);
    expect(c.orbit.yaw).toBeCloseTo(0.2);
  });

  it('places the camera on the sphere of radius distance', () => {
    const [x, y, z] = orbitPosition({ yaw: Math.PI / 2, pitch: 0, distance: 3 });
    expect([x, y, z].map((v) => +v.toFixed(6))).toEqual([3, 0, 0]);
  });
});
