// All tunable numbers live here, each with its unit. The object is mutable on
// purpose: the dev debug panel edits values live.
export const config = {
  // --- tracking ---
  /** @mediapipe/tasks-vision version used for the wasm CDN path (must match package.json). */
  mediapipeVersion: '1.1.0',
  /** Max hand-tracking inferences per second (fps); spares the render loop. */
  trackingMaxFps: 30,
  /** Hands MediaPipe should look for (count). */
  numHands: 2,
  /** MediaPipe detection / presence / tracking confidence (0..1). */
  minHandConfidence: 0.5,
  /** Webcam capture size (px). */
  cameraWidth: 640,
  cameraHeight: 480,
};
