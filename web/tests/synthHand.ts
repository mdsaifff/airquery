// Synthetic MediaPipe-shaped hands for tests, until real fixtures are recorded.
// Template is in "hand units" (wrist→middle MCP = 1), y pointing up the hand.
import type { RawFrame, RawHand } from '../src/tracking/rawFrame.ts';

type P = [number, number];

const OPEN: P[] = [
  [0, 0],
  [-0.35, -0.25], [-0.6, -0.45], [-0.8, -0.65], [-0.95, -0.85], // thumb
  [-0.3, -0.95], [-0.35, -1.35], [-0.38, -1.6], [-0.4, -1.85], // index
  [0, -1], [0, -1.45], [0, -1.72], [0, -1.98], // middle
  [0.25, -0.95], [0.28, -1.35], [0.3, -1.6], [0.32, -1.82], // ring
  [0.48, -0.85], [0.55, -1.15], [0.6, -1.35], [0.63, -1.52], // pinky
]; // prettier-ignore

const FINGERS = [5, 9, 13, 17]; // MCP indices of index..pinky

function curl(pts: P[], mcp: number): void {
  const [x, y] = pts[mcp];
  pts[mcp + 1] = [x, y - 0.3];
  pts[mcp + 2] = [x, y - 0.12];
  pts[mcp + 3] = [x, y + 0.05];
}

export type Pose = 'open' | 'point' | 'fist' | 'victory' | 'thumbDown';

export interface SynthOptions {
  pose?: Pose;
  /** 0 = thumb and index apart, 1 = tips touching. */
  pinch?: number;
  /** Wrist position, normalized image coords. */
  cx?: number;
  cy?: number;
  /** Wrist→middle MCP length in normalized x units. */
  scale?: number;
  handedness?: 'Left' | 'Right';
  gesture?: string;
  score?: number;
}

const ASPECT = 640 / 480; // keep the hand undistorted in a 4:3 frame

export function synthHand(o: SynthOptions = {}): RawHand {
  const { pose = 'open', pinch = 0, cx = 0.5, cy = 0.7, scale = 0.12 } = o;
  const pts = OPEN.map(([x, y]) => [x, y] as P);
  if (pose === 'fist' || pose === 'point' || pose === 'victory' || pose === 'thumbDown') {
    for (const m of FINGERS) {
      if (pose === 'point' && m === 5) continue;
      if (pose === 'victory' && (m === 5 || m === 9)) continue;
      curl(pts, m);
    }
    if (pose !== 'thumbDown') {
      pts[3] = [-0.35, -0.6];
      pts[4] = [-0.15, -0.75]; // thumb tucked across the fingers
    }
  }
  if (pose === 'thumbDown') {
    pts[3] = [-0.5, 0.2];
    pts[4] = [-0.55, 0.45];
  }
  if (pinch > 0) {
    const meet: P = [(pts[4][0] + pts[8][0]) / 2, (pts[4][1] + pts[8][1]) / 2];
    for (const i of [4, 8]) {
      pts[i] = [
        pts[i][0] + (meet[0] - pts[i][0]) * pinch,
        pts[i][1] + (meet[1] - pts[i][1]) * pinch,
      ];
    }
  }
  return {
    handedness: o.handedness ?? 'Left',
    landmarks: pts.map(([x, y]) => ({ x: cx + x * scale, y: cy + y * scale * ASPECT, z: 0 })),
    gesture: o.gesture ?? 'None',
    gestureScore: o.score ?? 0.9,
  };
}

/** Frames at a fixed rate; `at(i, t)` returns the hands for frame i at time t (ms). */
export function synthFrames(count: number, at: (i: number, t: number) => RawHand[], fps = 30) {
  const frames: RawFrame[] = [];
  for (let i = 0; i < count; i++) {
    const t = 1000 + (i * 1000) / fps;
    frames.push({ t, hands: at(i, t) });
  }
  return frames;
}
