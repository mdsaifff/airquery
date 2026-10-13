// Starts the webcam + hand tracker and draws the corner skeleton view.
// Runs in its own frame-callback loop; never touches the render loop.
import { metrics } from '../hud/metrics.ts';
import { startCamera } from './camera.ts';
import { HandTracker } from './handTracker.ts';
import type { RawFrame } from './rawFrame.ts';
import { drawSkeleton } from './skeletonView.ts';

export interface TrackingHooks {
  onFrame(frame: RawFrame, fps: number): void;
  skeletonColor(): string;
  onError(message: string): void;
}

function stopVideo(video: HTMLVideoElement | undefined): void {
  const stream = video?.srcObject;
  if (stream instanceof MediaStream) stream.getTracks().forEach((t) => t.stop());
}

/** Returns a stop function. Camera or model failures go to onError (mouse mode keeps working). */
export function startTracking(canvas: HTMLCanvasElement, hooks: TrackingHooks): () => void {
  let stopped = false;
  let video: HTMLVideoElement | undefined;
  let tracker: HandTracker | undefined;
  void (async () => {
    try {
      video = await startCamera();
      if (stopped) return stopVideo(video);
      tracker = await HandTracker.create();
      if (stopped) return tracker.close();
    } catch (err) {
      hooks.onError(`Camera unavailable (${String(err)}). Mouse mode.`);
      return;
    }
    const ctx = canvas.getContext('2d');
    const cam = video;
    const t = tracker;
    t.start(cam, (frame) => {
      metrics.inference.push(t.inferenceMs);
      hooks.onFrame(frame, t.fps);
      if (ctx) drawSkeleton(ctx, cam, frame, hooks.skeletonColor());
    });
  })();
  return () => {
    stopped = true;
    tracker?.close();
    stopVideo(video);
  };
}
