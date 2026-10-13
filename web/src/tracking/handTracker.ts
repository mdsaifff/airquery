// MediaPipe Gesture Recognizer wrapper. Runs in its own requestVideoFrameCallback
// loop, independent of the render loop. The JS API only offers VIDEO mode
// (synchronous per frame); results reach consumers via a callback, so treat
// them like LIVE_STREAM: they may lag the frame currently on screen.
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import type { GestureRecognizerResult } from '@mediapipe/tasks-vision';
import { config } from '../config.ts';
import type { RawFrame } from './rawFrame.ts';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

export function toRawFrame(result: GestureRecognizerResult, t: number): RawFrame {
  return {
    t,
    hands: result.landmarks.map((landmarks, i) => ({
      handedness: result.handedness[i]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right',
      landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
      gesture: result.gestures[i]?.[0]?.categoryName ?? 'None',
      gestureScore: result.gestures[i]?.[0]?.score ?? 0,
    })),
  };
}

export class HandTracker {
  /** Inferences in the last full second. */
  fps = 0;
  /** Duration of the last inference (ms). */
  inferenceMs = 0;
  private running = false;
  private frames = 0;
  private fpsWindowStart = 0;
  private lastInference = 0;
  private readonly recognizer: GestureRecognizer;

  private constructor(recognizer: GestureRecognizer) {
    this.recognizer = recognizer;
  }

  static async create(): Promise<HandTracker> {
    const fileset = await FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${config.mediapipeVersion}/wasm`,
    );
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO' as const,
      numHands: config.numHands,
      minHandDetectionConfidence: config.minHandConfidence,
      minHandPresenceConfidence: config.minHandConfidence,
      minTrackingConfidence: config.minHandConfidence,
    });
    try {
      return new HandTracker(await GestureRecognizer.createFromOptions(fileset, options('GPU')));
    } catch {
      return new HandTracker(await GestureRecognizer.createFromOptions(fileset, options('CPU')));
    }
  }

  start(video: HTMLVideoElement, onFrame: (frame: RawFrame) => void): void {
    this.running = true;
    const step = () => {
      if (!this.running) return;
      const now = performance.now();
      if (now - this.lastInference >= 1000 / config.trackingMaxFps) {
        this.lastInference = now;
        const result = this.recognizer.recognizeForVideo(video, now);
        this.inferenceMs = performance.now() - now;
        this.countFrame(now);
        onFrame(toRawFrame(result, now));
      }
      video.requestVideoFrameCallback(step);
    };
    video.requestVideoFrameCallback(step);
  }

  close(): void {
    this.running = false;
    this.recognizer.close();
  }

  private countFrame(now: number): void {
    this.frames++;
    if (now - this.fpsWindowStart >= 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsWindowStart);
      this.frames = 0;
      this.fpsWindowStart = now;
    }
  }
}
