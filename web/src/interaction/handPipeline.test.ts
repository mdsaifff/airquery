import { describe, expect, it } from 'vitest';
import { CameraController } from './cameraController.ts';
import { HandPipeline } from './handPipeline.ts';
import type { PipelineTargets } from './handPipeline.ts';

function rig(uiPress: (x: number, y: number) => boolean) {
  const camera = new CameraController(
    { rotateRadPerPx: 0.005, dampingHalfLifeMs: 200, distanceMin: 1.25, distanceMax: 8, pitchLimit: 1.45, autoSpinRadPerSec: 0, autoSpinIdleMs: 1e9, animMs: 500, flyToDistance: 2 }, // prettier-ignore
    { yaw: 0, pitch: 0, distance: 3 },
  );
  const log: string[] = [];
  const targets: PipelineTargets = {
    camera,
    rotateGain: 1,
    cursor: () => {},
    listening: () => {},
    startOver: () => {},
    explain: () => {},
    circle: (step) => log.push(`circle:${step}`),
    uiPress,
  };
  return { pipeline: new HandPipeline(targets), log };
}

describe('HandPipeline: pinching on the HUD', () => {
  it('a pinch on a scene name is a press: the globe neither rotates nor circles', () => {
    const presses: string[] = [];
    const { pipeline, log } = rig((x, y) => (presses.push(`${x},${y}`), true));
    pipeline.dispatch({ kind: 'cursor', x: 40, y: 90 });
    pipeline.dispatch({ kind: 'pinchStart', hand: 'right', x: 40, y: 90 });
    expect(presses).toEqual(['40,90']);
    pipeline.dispatch({ kind: 'pinchMove', hand: 'right', x: 140, y: 90 });
    pipeline.dispatch({ kind: 'circleHold', hand: 'right', x: 140, y: 90 });
    expect(pipeline.state.mode).toBe('pointing');
    pipeline.dispatch({ kind: 'pinchEnd', hand: 'right', x: 140, y: 90 });
    expect(log).toEqual([]);
    expect(pipeline.state.mode).toBe('pointing');
  });

  it('a pinch anywhere else still rotates the globe', () => {
    const { pipeline } = rig(() => false);
    pipeline.dispatch({ kind: 'cursor', x: 400, y: 300 });
    pipeline.dispatch({ kind: 'pinchStart', hand: 'right', x: 400, y: 300 });
    expect(pipeline.state.mode).toBe('rotating');
  });
});
