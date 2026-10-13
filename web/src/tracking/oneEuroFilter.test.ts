import { describe, expect, it } from 'vitest';
import { HandSmoother } from './handSmoother.ts';
import { OneEuroFilter } from './oneEuroFilter.ts';

const params = { minCutoff: 1, beta: 0.01, dCutoff: 1 };
const DT = 1000 / 30; // 30 fps tracking

/** Deterministic noise in [-1, 1]. */
function noise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return (s / 2 ** 32) * 2 - 1;
  };
}

const std = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

describe('OneEuroFilter', () => {
  it('cuts jitter on a noisy, still signal by more than 3x', () => {
    const f = new OneEuroFilter(params);
    const rnd = noise(7);
    const raw: number[] = [];
    const out: number[] = [];
    for (let i = 0; i < 300; i++) {
      const v = 500 + 4 * rnd(); // a hand held still, ±4 px landmark jitter
      raw.push(v);
      out.push(f.filter(v, i * DT));
    }
    expect(std(out.slice(30))).toBeLessThan(std(raw.slice(30)) / 3);
  });

  it('follows a large step quickly (low lag when moving)', () => {
    const f = new OneEuroFilter(params);
    for (let i = 0; i < 30; i++) f.filter(0, i * DT);
    let frames = 0;
    let v = 0;
    while (v < 270 && frames < 100) {
      frames++;
      v = f.filter(300, (30 + frames) * DT);
    }
    // 90% of a 300 px jump within ~170 ms at 30 fps
    expect(frames).toBeLessThanOrEqual(5);
  });

  it('a slow filter (beta 0) lags the same step much more', () => {
    const slow = new OneEuroFilter({ ...params, beta: 0 });
    for (let i = 0; i < 30; i++) slow.filter(0, i * DT);
    expect(slow.filter(300, 31 * DT)).toBeLessThan(100);
  });

  it('returns the first sample unchanged and ignores non-advancing time', () => {
    const f = new OneEuroFilter(params);
    expect(f.filter(42, 0)).toBe(42);
    expect(f.filter(100, 0)).toBe(42);
  });
});

describe('HandSmoother', () => {
  it('filters each hand separately and resets a hand that disappears', () => {
    const s = new HandSmoother(params);
    const hand = (x: number) => ({
      hand: 'right' as const,
      points: [{ x, y: 0 }],
      gesture: 'None',
      gestureScore: 1,
    });
    s.smooth({ t: 0, hands: [hand(0)] });
    const lagged = s.smooth({ t: DT, hands: [hand(100)] }).hands[0].points[0].x;
    expect(lagged).toBeGreaterThan(0);
    expect(lagged).toBeLessThan(100);
    s.smooth({ t: 2 * DT, hands: [] }); // hand lost
    expect(s.smooth({ t: 3 * DT, hands: [hand(500)] }).hands[0].points[0].x).toBe(500);
  });
});
