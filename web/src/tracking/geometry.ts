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
