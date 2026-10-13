import { describe, expect, it } from 'vitest';
import { synthHand } from '../../tests/synthHand.ts';
import {
  fingertipSpread,
  handScale,
  pinchDistance,
  pinchPoint,
  toScreen,
  toScreenPoint,
  userHand,
} from './geometry.ts';

const W = 1280;
const H = 720;
const screenHand = (opts: Parameters<typeof synthHand>[0]) =>
  toScreen({ t: 0, hands: [synthHand(opts)] }, W, H).hands[0];

describe('mirroring', () => {
  it('maps normalized coords into mirrored screen px', () => {
    expect(toScreenPoint(0, 0, W, H)).toEqual({ x: W, y: 0 });
    expect(toScreenPoint(1, 1, W, H)).toEqual({ x: 0, y: H });
    expect(toScreenPoint(0.25, 0.5, W, H)).toEqual({ x: 960, y: 360 });
  });

  it('a hand moving right in the room moves right on screen', () => {
    // In the raw (unmirrored) camera image, moving right in the room means x decreases.
    const before = screenHand({ cx: 0.6 });
    const after = screenHand({ cx: 0.4 });
    expect(after.points[8].x).toBeGreaterThan(before.points[8].x);
  });

  it("swaps MediaPipe's selfie-mode handedness", () => {
    expect(userHand('Left')).toBe('right');
    expect(userHand('Right')).toBe('left');
    expect(screenHand({ handedness: 'Left' }).hand).toBe('right');
  });
});

describe('scale invariance', () => {
  it('pinch distance and fingertip spread do not change with distance from the camera', () => {
    const near = screenHand({ scale: 0.2, pinch: 0.5 });
    const far = screenHand({ scale: 0.06, pinch: 0.5, cx: 0.3 });
    expect(handScale(near.points)).toBeGreaterThan(3 * handScale(far.points));
    expect(pinchDistance(near.points)).toBeCloseTo(pinchDistance(far.points), 6);
    const a = fingertipSpread(near.points);
    const b = fingertipSpread(far.points);
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
  });

  it('pinch distance shrinks to zero as the tips meet', () => {
    const open = pinchDistance(screenHand({ pinch: 0 }).points);
    const half = pinchDistance(screenHand({ pinch: 0.5 }).points);
    const closed = pinchDistance(screenHand({ pinch: 1 }).points);
    expect(open).toBeGreaterThan(1);
    expect(half).toBeCloseTo(open / 2, 6);
    expect(closed).toBeCloseTo(0, 6);
  });

  it('pinch point is the thumb/index midpoint', () => {
    const h = screenHand({ pinch: 1 });
    expect(pinchPoint(h.points).x).toBeCloseTo(h.points[8].x);
    expect(pinchPoint(h.points).y).toBeCloseTo(h.points[4].y);
  });

  it('a degenerate hand gives infinite distance instead of NaN', () => {
    const p = Array.from({ length: 21 }, () => ({ x: 5, y: 5 }));
    expect(pinchDistance(p)).toBe(Infinity);
  });
});
