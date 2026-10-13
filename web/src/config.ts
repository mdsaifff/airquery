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

  /** One Euro filter on every landmark (screen px). */
  filter: {
    /** Cutoff at rest (Hz). Lower = steadier, laggier. */
    minCutoff: 1.0,
    /** Cutoff gain with speed (Hz per px/s). Higher = less lag on fast moves. */
    beta: 0.01,
    /** Cutoff of the speed estimate (Hz). */
    dCutoff: 1.0,
  },

  // --- gestures ---
  gesture: {
    /** Pinch starts below this thumb-index distance (hand-scale units)... */
    pinchEnter: 0.35,
    /** ...and ends above this one (hysteresis; hand-scale units). */
    pinchExit: 0.5,
    /** Consecutive frames a pinch must hold before pinchStart (frames). */
    pinchStableFrames: 2,
    /** Min wrist→index-tip distance for a pinch; a fist is shorter (hand-scale units). */
    pinchMinIndexReach: 1.15,
    /** A hold restarts if the palm drifts further than this (hand-scale units). */
    holdMaxDrift: 0.4,
    /** Consecutive frames a built-in label must hold to count (frames). */
    labelStableFrames: 3,
    /** Min built-in gesture score to accept a label (0..1). */
    minGestureScore: 0.6,
    /** Open palm hold for reset (ms). */
    resetHoldMs: 500,
    /** Thumb down hold for undo (ms). */
    undoHoldMs: 400,
    /** No hands for this long emits handsLost (ms). */
    handsLostMs: 500,
    /** Swipe: wrist travels this far sideways (hand-scale units)... */
    swipeMinHandScales: 3.5,
    /** ...within this window (ms), then no new swipe for the cooldown (ms). */
    swipeWindowMs: 350,
    swipeCooldownMs: 900,
  },

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
  /** Hover picks the nearest point within this radius (px). */
  pickRadiusPx: 14,
  /** Rows kept from a dropped CSV (count); every point is tweened per frame. */
  csvMaxRows: 100_000,
  /** Lasso path keeps a point every this many px of cursor travel (px). */
  lassoMinStepPx: 6,
  /** "What's this?" summarizes visible points within this radius of the pointer (px). */
  explainRadiusPx: 70,
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
  /** Extra gain on hand pinch-drag rotation vs. mouse drag (×). */
  handRotateGain: 1.0,
  /** Gesture study (G): trial timeout, cursor-only time that counts as "point", rest between trials (ms). */
  study: { timeoutMs: 5000, pointHoldMs: 1000, restMs: 1200 },
  /** Wheel zoom: scale = exp(-deltaY * this) (1/px). */
  wheelZoomPerPx: 0.0015,
};
