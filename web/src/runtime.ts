// Wires the imperative parts together (tracking, scene, data). React only
// mounts the DOM elements and the HUD; it never sees per-frame data.
import { config } from './config.ts';
import { hudStore } from './hud/store.ts';
import { startCamera } from './tracking/camera.ts';
import { HandTracker } from './tracking/handTracker.ts';
import { downloadJson, LandmarkRecorder } from './tracking/recorder.ts';
import { drawSkeleton } from './tracking/skeletonView.ts';

export interface RuntimeElements {
  camCanvas: HTMLCanvasElement;
}

function stopVideo(video: HTMLVideoElement | undefined): void {
  const stream = video?.srcObject;
  if (stream instanceof MediaStream) stream.getTracks().forEach((t) => t.stop());
}

export function startRuntime(els: RuntimeElements): () => void {
  let disposed = false;
  let video: HTMLVideoElement | undefined;
  let tracker: HandTracker | undefined;

  void (async () => {
    try {
      video = await startCamera();
      if (disposed) return stopVideo(video);
      tracker = await HandTracker.create();
      if (disposed) return tracker.close();
    } catch (err) {
      hudStore.cameraError = `Camera unavailable (${String(err)}). Mouse mode.`;
      return;
    }
    const ctx = els.camCanvas.getContext('2d');
    const cam = video;
    tracker.start(cam, (frame) => {
      if (ctx) drawSkeleton(ctx, cam, frame, recorder.recording ? '#f87171' : '#7dd3fc');
      hudStore.trackingFps = tracker?.fps ?? 0;
      const fixture = recorder.push(frame, 'recording');
      if (fixture) downloadJson(`fixture-${Date.now()}.json`, fixture);
    });
  })();

  // Dev only: Shift+R records 3 s of landmarks to a JSON download (plain R = reset view).
  const recorder = new LandmarkRecorder();
  const onKey = (e: KeyboardEvent) => {
    if (import.meta.env.DEV && e.shiftKey && e.code === 'KeyR') {
      recorder.start(performance.now(), config.recordDurationMs);
    }
  };
  window.addEventListener('keydown', onKey);

  return () => {
    disposed = true;
    window.removeEventListener('keydown', onKey);
    tracker?.close();
    stopVideo(video);
  };
}
