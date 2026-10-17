// Mouse and touch: drag to rotate, wheel or two-finger pinch to zoom. Same controller as the hands.
import { config } from '../config.ts';
import type { CameraController } from './cameraController.ts';
import { Pinch } from './pinch.ts';

export function attachMouse(el: HTMLElement, camera: CameraController): () => void {
  let dragging = false;
  const pinch = new Pinch();
  const down = (e: PointerEvent) => {
    pinch.down(e.pointerId, e.clientX, e.clientY);
    if (pinch.count >= 2) {
      dragging = false; // a second finger turns the drag into a pinch
      camera.stop(performance.now());
      return;
    }
    dragging = true;
    el.setPointerCapture(e.pointerId);
    camera.beginDrag(performance.now());
  };
  const move = (e: PointerEvent) => {
    const k = pinch.move(e.pointerId, e.clientX, e.clientY);
    if (k !== null) camera.dollyBy(k, performance.now());
    else if (dragging && pinch.count <= 1) {
      camera.rotateBy(e.movementX, e.movementY, performance.now());
    }
  };
  const up = (e: PointerEvent) => {
    pinch.up(e.pointerId);
    if (!dragging) return;
    dragging = false;
    camera.endDrag(performance.now());
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    camera.dollyBy(Math.exp(-e.deltaY * config.wheelZoomPerPx), performance.now());
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
  };
}
