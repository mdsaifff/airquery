// Camera control driven end to end by synthetic gesture events:
// events -> state machine -> effects -> camera controller.
import { describe, expect, it } from 'vitest';
import { CameraController } from './cameraController.ts';
import type { CameraOptions } from './cameraController.ts';
import { applyEffects } from './effects.ts';
import { initialState, reduce } from './stateMachine.ts';
import type { InteractionState } from './stateMachine.ts';
import type { GestureEvent } from './types.ts';

const opts: CameraOptions = {
  rotateRadPerPx: 0.005,
  dampingHalfLifeMs: 200,
  distanceMin: 1.25,
  distanceMax: 8,
  pitchLimit: 1.45,
  autoSpinRadPerSec: 0,
  autoSpinIdleMs: 1e9,
  animMs: 500,
  flyToDistance: 2,
};

function rig() {
  const camera = new CameraController(opts, { yaw: 0, pitch: 0, distance: 3 });
  let state: InteractionState = initialState;
  const log: string[] = [];
  const targets = {
    camera,
    rotateGain: 1,
    cursor: (v: boolean) => log.push(v ? 'cursor' : 'nocursor'),
    listening: (a: boolean) => log.push(a ? 'listen' : 'unlisten'),
    undo: () => log.push('undo'),
  };
  const send = (e: GestureEvent, now: number) => {
    const [next, fx] = reduce(state, e);
    state = next;
    applyEffects(fx, targets, now);
    camera.update(now);
  };
  return { camera, send, log, mode: () => state.mode };
}

describe('camera control from synthetic gestures', () => {
  it('pinch-drag rotates, release keeps spinning then settles', () => {
    const { camera, send } = rig();
    send({ kind: 'cursor', x: 300, y: 300 }, 0);
    send({ kind: 'pinchStart', hand: 'right', x: 300, y: 300 }, 16);
    for (let i = 1; i <= 10; i++) send({ kind: 'pinchMove', hand: 'right', x: 300 + i * 12, y: 300 }, 16 + i * 16); // prettier-ignore
    const atRelease = camera.orbit.yaw;
    expect(atRelease).toBeCloseTo(-120 * 0.005);
    send({ kind: 'pinchEnd', hand: 'right', x: 420, y: 300 }, 192);
    for (let t = 208; t < 400; t += 16) camera.update(t);
    expect(camera.orbit.yaw).toBeLessThan(atRelease); // damped spin continues
    for (let t = 400; t < 4000; t += 16) camera.update(t);
    const settled = camera.orbit.yaw;
    camera.update(4016);
    expect(camera.orbit.yaw).toBeCloseTo(settled, 6);
  });

  it('two-hand pinch pulled apart dollies in; zoom start kills any fling', () => {
    const { camera, send, mode } = rig();
    send({ kind: 'cursor', x: 0, y: 0 }, 0);
    send({ kind: 'pinchStart', hand: 'right', x: 300, y: 300 }, 16);
    send({ kind: 'pinchMove', hand: 'right', x: 400, y: 300 }, 32);
    send({ kind: 'pinchStart', hand: 'left', x: 600, y: 300 }, 48);
    expect(mode()).toBe('zooming');
    const yaw = camera.orbit.yaw;
    for (let i = 0; i < 10; i++) send({ kind: 'twoHandZoom', scaleDelta: 1.05 }, 64 + i * 16);
    expect(camera.orbit.distance).toBeCloseTo(3 / 1.05 ** 10);
    expect(camera.orbit.yaw).toBe(yaw);
  });

  it('clutch freezes rotation until released', () => {
    const { camera, send } = rig();
    send({ kind: 'cursor', x: 0, y: 0 }, 0);
    send({ kind: 'clutch', active: true }, 16);
    send({ kind: 'pinchStart', hand: 'right', x: 0, y: 0 }, 32);
    send({ kind: 'pinchMove', hand: 'right', x: 200, y: 0 }, 48);
    expect(camera.orbit.yaw).toBe(0);
    send({ kind: 'clutch', active: false }, 64);
    send({ kind: 'pinchEnd', hand: 'right', x: 0, y: 0 }, 80);
    send({ kind: 'pinchStart', hand: 'right', x: 0, y: 0 }, 96);
    send({ kind: 'pinchMove', hand: 'right', x: 100, y: 0 }, 112);
    expect(camera.orbit.yaw).toBeCloseTo(-0.5);
  });

  it('open-palm reset animates home; undo and listening reach their callbacks', () => {
    const { camera, send, log } = rig();
    send({ kind: 'cursor', x: 0, y: 0 }, 0);
    send({ kind: 'pinchStart', hand: 'right', x: 0, y: 0 }, 16);
    send({ kind: 'pinchMove', hand: 'right', x: 100, y: 50 }, 32);
    send({ kind: 'pinchEnd', hand: 'right', x: 100, y: 50 }, 600);
    send({ kind: 'fire', gesture: 'reset' }, 600);
    camera.update(1200);
    expect(camera.orbit.yaw).toBeCloseTo(0);
    expect(camera.orbit.pitch).toBeCloseTo(0);
    send({ kind: 'fire', gesture: 'undo' }, 1300);
    send({ kind: 'talk', active: true }, 1400);
    send({ kind: 'talk', active: false }, 2400);
    send({ kind: 'handsLost' }, 3000);
    expect(log).toEqual(['cursor', 'cursor', 'undo', 'listen', 'unlisten', 'nocursor']);
  });

  it('fly-to points the camera at a lat/lon', () => {
    const { camera } = rig();
    camera.flyTo(35, 139, 0);
    camera.update(1);
    camera.update(600);
    expect(camera.orbit.pitch).toBeCloseTo((35 * Math.PI) / 180);
    expect(Math.cos(camera.orbit.yaw - (139 * Math.PI) / 180)).toBeCloseTo(1);
  });
});
