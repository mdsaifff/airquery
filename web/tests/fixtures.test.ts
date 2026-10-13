import { describe, expect, it } from 'vitest';
import { LandmarkRecorder } from '../src/tracking/recorder.ts';
import { listFixtures, loadFixture } from './fixtures.ts';

describe('fixture loader', () => {
  it('reads the sample fixture', () => {
    expect(listFixtures()).toContain('sample-point');
    const fx = loadFixture('sample-point');
    expect(fx.frames).toHaveLength(3);
    expect(fx.frames[0].hands[0].landmarks).toHaveLength(21);
    expect(fx.frames[0].hands[0].gesture).toBe('Pointing_Up');
  });
});

describe('LandmarkRecorder', () => {
  it('collects frames for the duration, then returns the fixture once', () => {
    const rec = new LandmarkRecorder();
    expect(rec.push({ t: 0, hands: [] }, 'x')).toBeNull(); // not recording yet
    rec.start(100, 3000);
    expect(rec.push({ t: 100, hands: [] }, 'x')).toBeNull();
    expect(rec.push({ t: 2000, hands: [] }, 'x')).toBeNull();
    const fx = rec.push({ t: 3100, hands: [] }, 'x');
    expect(fx?.frames.map((f) => f.t)).toEqual([100, 2000]);
    expect(rec.recording).toBe(false);
    expect(rec.push({ t: 3200, hands: [] }, 'x')).toBeNull();
  });
});
