// Applies state-machine effects. Camera effects go straight to the (pure)
// controller; everything else is handed to callbacks the runtime provides.
import type { CameraController } from './cameraController.ts';
import type { Effect } from './stateMachine.ts';

export interface EffectTargets {
  camera: CameraController;
  /** Hand gain on top of the controller's rad/px (×). */
  rotateGain: number;
  cursor(visible: boolean, x?: number, y?: number): void;
  listening(active: boolean): void;
  undo(): void;
  switchScene(direction: 'left' | 'right'): void;
  lasso(step: 'start' | 'point' | 'end' | 'cancel', x?: number, y?: number): void;
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
        t.camera.endDrag(now);
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
      case 'resetView':
        t.camera.reset(now);
        break;
      case 'undo':
        t.undo();
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
        t.listening(true);
        break;
      case 'stopListening':
        t.listening(false);
        break;
      case 'switchScene':
        t.switchScene(e.direction);
        break;
      case 'lassoStart':
        t.lasso('start');
        break;
      case 'lassoPoint':
        t.lasso('point', e.x, e.y);
        break;
      case 'lassoEnd':
        t.lasso('end');
        break;
      case 'lassoCancel':
        t.lasso('cancel');
        break;
    }
  }
}
