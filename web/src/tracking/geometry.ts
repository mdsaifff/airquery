// Pure hand geometry. The only place raw MediaPipe coordinates become screen space.
import type { Hand } from '../interaction/types.ts';
import type { RawFrame } from './rawFrame.ts';

export interface Vec2 {
  x: number;
  y: number;
}

export interface ScreenHand {
  hand: Hand;
  /** 21 landmarks in mirrored screen px. */
  points: Vec2[];
  gesture: string;
  gestureScore: number;
}

export interface HandsFrame {
  t: number;
  hands: ScreenHand[];
}

/** Mirror normalized image coords into screen px: a hand moving right moves right on screen. */
export function toScreenPoint(x: number, y: number, width: number, height: number): Vec2 {
  return { x: (1 - x) * width, y: y * height };
}

/**
 * MediaPipe labels handedness as if the image were mirrored; our input is the raw
 * (unmirrored) webcam frame, so its 'Left' is the user's right hand.
 */
export function userHand(label: 'Left' | 'Right'): Hand {
  return label === 'Left' ? 'right' : 'left';
}

export function toScreen(frame: RawFrame, width: number, height: number): HandsFrame {
  return {
    t: frame.t,
    hands: frame.hands.map((h) => ({
      hand: userHand(h.handedness),
      points: h.landmarks.map((p) => toScreenPoint(p.x, p.y, width, height)),
      gesture: h.gesture,
      gestureScore: h.gestureScore,
    })),
  };
}

// Landmark indices (MediaPipe hand model).
export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_TIP = 8;
export const MIDDLE_MCP = 9;
export const FINGERTIPS = [4, 8, 12, 16, 20] as const;

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Hand scale: wrist to middle-finger MCP (px). Everything else is divided by it. */
export function handScale(points: readonly Vec2[]): number {
  return dist(points[WRIST], points[MIDDLE_MCP]);
}

/** Distance between two landmarks in hand-scale units (camera-distance invariant). */
export function normalizedDistance(points: readonly Vec2[], a: number, b: number): number {
  const s = handScale(points);
  return s > 0 ? dist(points[a], points[b]) / s : Infinity;
}

/** Thumb tip to index tip, in hand-scale units. Small = pinching. */
export function pinchDistance(points: readonly Vec2[]): number {
  return normalizedDistance(points, THUMB_TIP, INDEX_TIP);
}

/** Midpoint of thumb tip and index tip (px): where a pinch "grabs". */
export function pinchPoint(points: readonly Vec2[]): Vec2 {
  const a = points[THUMB_TIP];
  const b = points[INDEX_TIP];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Each fingertip's distance from the wrist, in hand-scale units (thumb..pinky). */
export function fingertipSpread(points: readonly Vec2[]): number[] {
  return FINGERTIPS.map((tip) => normalizedDistance(points, WRIST, tip));
}
