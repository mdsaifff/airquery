import { describe, expect, it } from 'vitest';
import { DAY_MS, TimeMachine } from './timeMachine.ts';
import type { TimedCloud } from './timeMachine.ts';

const T0 = Date.UTC(2024, 0, 1);
const times = [T0, T0 + 1 * DAY_MS, T0 + 5 * DAY_MS, T0 + 10 * DAY_MS];

function fakeCloud(): TimedCloud & { playheads: (number | null)[] } {
  const c = {
    visible: new Uint8Array(4).fill(1),
    playheads: [] as (number | null)[],
    setVisibility(mask: Uint8Array | null) {
      if (mask) c.visible.set(mask);
      else c.visible.fill(1);
    },
    setPlayhead(day: number | null) {
      c.playheads.push(day);
    },
  };
  return c;
}

function started() {
  const tm = new TimeMachine();
  tm.attach(times);
  const cloud = fakeCloud();
  tm.onView(cloud.visible);
  return { tm, cloud };
}

describe('TimeMachine', () => {
  it('is unavailable without times', () => {
    const tm = new TimeMachine();
    tm.attach(null);
    expect(tm.available).toBe(false);
  });

  it('plays forward at days per second and shows what has happened', () => {
    const { tm, cloud } = started();
    tm.setSpeed(1);
    tm.play(true);
    const r = tm.step(2000, cloud); // 2 days in
    expect(r?.shown).toBe(2);
    expect([...cloud.visible]).toEqual([1, 1, 0, 0]);
    expect(r?.arrived).toEqual([0, 1]);
    expect(cloud.playheads.at(-1)).toBeCloseTo(2);
  });

  it('only counts points the query shows', () => {
    const { tm, cloud } = started();
    cloud.visible.set([0, 1, 1, 1]);
    tm.onView(cloud.visible);
    tm.setSpeed(7);
    tm.play(true);
    expect(tm.step(1000, cloud)?.shown).toBe(2); // day 7: rows 1 and 2
  });

  it('a new view during playback re-masks with the new selection', () => {
    const { tm, cloud } = started();
    tm.setSpeed(1);
    tm.play(true);
    tm.step(6000, cloud); // day 6: rows 0, 1, 2
    const query = Uint8Array.from([0, 0, 1, 1]); // a chart click applied a new selection
    cloud.setVisibility(query);
    tm.onView(cloud.visible);
    tm.step(0, cloud);
    expect([...cloud.visible]).toEqual([0, 0, 1, 0]);
  });

  it('seek pauses and jumps; fractions map onto the range', () => {
    const { tm, cloud } = started();
    tm.play(true);
    tm.seekFraction(0.5);
    expect(tm.playing).toBe(false);
    expect(tm.day).toBeCloseTo(5);
    expect(tm.step(16, cloud)?.shown).toBe(3);
  });

  it('reaching the end stops and restores the selection', () => {
    const { tm, cloud } = started();
    tm.setSpeed(30);
    tm.play(true);
    const r = tm.step(1000, cloud);
    expect(r?.ended).toBe(true);
    expect(tm.active).toBe(false);
    expect([...cloud.visible]).toEqual([1, 1, 1, 1]);
    expect(cloud.playheads.at(-1)).toBeNull();
  });

  it('does nothing when idle', () => {
    const { tm, cloud } = started();
    expect(tm.step(1000, cloud)).toBeNull();
  });

  it('seekDate jumps to a calendar date', () => {
    const { tm } = started();
    tm.seekDate(T0 + 5 * DAY_MS);
    expect(tm.day).toBeCloseTo(5);
    expect(tm.playing).toBe(false);
  });
});
