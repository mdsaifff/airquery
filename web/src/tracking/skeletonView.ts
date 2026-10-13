// Draws the webcam image and hand skeleton into the small corner canvas.
// The canvas is mirrored with CSS, so this draws raw (unmirrored) coords.
import { GestureRecognizer } from '@mediapipe/tasks-vision';
import type { RawFrame } from './rawFrame.ts';

const CONNECTIONS = GestureRecognizer.HAND_CONNECTIONS;

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  frame: RawFrame | null,
  color: string,
): void {
  const { width, height } = ctx.canvas;
  ctx.drawImage(video, 0, 0, width, height);
  if (!frame) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  for (const hand of frame.hands) {
    const pts = hand.landmarks;
    ctx.beginPath();
    for (const { start, end } of CONNECTIONS) {
      ctx.moveTo(pts[start].x * width, pts[start].y * height);
      ctx.lineTo(pts[end].x * width, pts[end].y * height);
    }
    ctx.stroke();
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
