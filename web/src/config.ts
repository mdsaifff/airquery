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
  /** Length of a Shift+R landmark recording (ms). */
  recordDurationMs: 3000,

  // --- scene ---
  /** Vertical field of view (degrees). */
  cameraFovDeg: 45,
  /** Radial depth exaggeration (×): r = 1 - depth/6371 * this. */
  depthExaggeration: 3,
  /** Point diameter range (scene units; Earth radius = 1). */
  pointMinSize: 0.008,
  pointMaxSize: 0.045,
  /** How much far-side points fade (0..1). */
  farSideDim: 0.6,
  /** Fade time for points entering/leaving a filter (ms). */
  filterAnimMs: 600,

  // --- camera ---
  /** Camera distance at start / after reset (scene units). */
  cameraHomeDistance: 3.2,
  /** Rotation per dragged pixel at home distance (rad/px). */
  rotateRadPerPx: 0.005,
  /** Half-life of the spin after releasing a drag (ms). */
  dampingHalfLifeMs: 220,
  /** Zoom limits (scene units). */
  distanceMin: 1.25,
  distanceMax: 8,
  /** Max camera latitude (rad). */
  pitchLimit: 1.45,
  /** Idle globe spin (rad/s) and idle time before it starts (ms). */
  autoSpinRadPerSec: 0.06,
  autoSpinIdleMs: 4000,
  /** Reset / fly-to animation length (ms). */
  animMs: 1200,
  /** Distance a fly-to ends at unless already closer (scene units). */
  flyToDistance: 2.2,
  /** Wheel zoom: scale = exp(-deltaY * this) (1/px). */
  wheelZoomPerPx: 0.0015,
};
