import { describe, expect, it } from 'vitest';
import { introCutoff, introMask, IntroPlayer } from './intro.ts';

const times = [100, 200, 300, 400];

describe('intro helpers', () => {
  it('maps progress onto the time range', () => {
    expect(introCutoff(0, 100, 400)).toBe(100);
    expect(introCutoff(0.5, 100, 400)).toBe(250);
    expect(introCutoff(2, 100, 400)).toBe(400);
  });

  it('shows rows up to the cutoff and counts them', () => {
    const out = new Uint8Array(4);
    expect(introMask(times, 250, out)).toBe(2);
    expect([...out]).toEqual([1, 1, 0, 0]);
  });
});

describe('IntroPlayer', () => {
  it('plays over its duration, then reports done', () => {
    const p = new IntroPlayer(times, 1000);
    const out = new Uint8Array(4);
    p.begin(0);
    expect(p.step(500, out)).toEqual({ cutoff: 250, shown: 2, done: false });
    expect(p.step(1000, out).done).toBe(true);
    expect(p.active).toBe(false);
  });

  it('skip ends the replay on the next step', () => {
    const p = new IntroPlayer(times, 1000);
    const out = new Uint8Array(4);
    p.begin(0);
    p.skip();
    expect(p.step(10, out).done).toBe(true);
  });

  it('without a time column it only waits out the fly-in', () => {
    const p = new IntroPlayer(null, 1000);
    const out = new Uint8Array(4);
    p.begin(0);
    expect(p.step(500, out)).toEqual({ cutoff: null, shown: 0, done: false });
  });
});
