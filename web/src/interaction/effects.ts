// Applies state-machine effects. Camera effects go straight to the (pure)
// controller; everything else is handed to callbacks the runtime provides.
import type { CameraController } from './cameraController.ts';
import type { Effect } from './stateMachine.ts';

export interface EffectTargets {
  camera: CameraController;
  /** Hand gain on top of the controller's rad/px (×). */
  rotateGain: number;
  /** false: releasing a hand drag stops the globe instead of flinging it. */
  releaseFling?: boolean;
  cursor(visible: boolean, x?: number, y?: number): void;
  /** at: where the pointing finger rests ("here"), when the hands started listening. */
  listening(active: boolean, at?: { x: number; y: number }): void;
  /** Open palm held: camera home, filters cleared, replay stopped, selection dropped. */
  startOver(): void;
  switchScene(direction: 'left' | 'right'): void;
  /** Custom gesture: "what's this?" without speaking. */
  explain(): void;
  /** Circle selection: start at (a, b) px, radius a px, end (select) or cancel. */
  circle(step: 'start' | 'radius' | 'end' | 'cancel', a?: number, b?: number): void;
}

export function applyEffects(effects: readonly Effect[], t: EffectTargets, now: number): void {
  for (const e of effects) {
    switch (e.kind) {
      case 'beginDrag':
        t.camera.beginDrag(now);
        break;
      case 'rotate':
        t.camera.rotateBy(e.dx * t.rotateGain, e.dy * t.rotateGain, now);
        break;
      case 'release':
        if (t.releaseFling === false) t.camera.stop(now);
        else t.camera.endDrag(now);
        break;
      case 'beginZoom':
      case 'stopDrag':
        t.camera.stop(now);
        break;
      case 'dolly':
        t.camera.dollyBy(e.scale, now);
        break;
      case 'freeze':
        t.camera.setFrozen(true, now);
        break;
      case 'unfreeze':
        t.camera.setFrozen(false, now);
        break;
      case 'startOver':
        t.startOver();
        break;
      case 'showCursor':
        t.cursor(true);
        break;
      case 'hideCursor':
        t.cursor(false);
        break;
      case 'moveCursor':
        t.cursor(true, e.x, e.y);
        break;
      case 'startListening':
        t.listening(true, e.x !== undefined && e.y !== undefined ? { x: e.x, y: e.y } : undefined);
        break;
      case 'stopListening':
        t.listening(false);
        break;
      case 'explain':
        t.explain();
        break;
      case 'switchScene':
        t.switchScene(e.direction);
        break;
      case 'circleStart':
        t.circle('start', e.x, e.y);
        break;
      case 'circleRadius':
        t.circle('radius', e.r);
        break;
      case 'circleEnd':
        t.circle('end');
        break;
      case 'circleCancel':
        t.circle('cancel');
        break;
    }
  }
}
