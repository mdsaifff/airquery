// Mouse fallback: drag to rotate, wheel to zoom. Same controller as the hands.
import { config } from '../config.ts';
import type { CameraController } from './cameraController.ts';

export function attachMouse(el: HTMLElement, camera: CameraController): () => void {
  let dragging = false;
  const down = (e: PointerEvent) => {
    dragging = true;
    el.setPointerCapture(e.pointerId);
    camera.beginDrag(performance.now());
  };
  const move = (e: PointerEvent) => {
    if (dragging) camera.rotateBy(e.movementX, e.movementY, performance.now());
  };
  const up = () => {
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
