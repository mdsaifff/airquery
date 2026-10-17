import { describe, expect, it, vi } from 'vitest';
import { hudStore } from './hud/store.ts';
import { Playground } from './playground.ts';
import type { PlaygroundHost } from './playground.ts';
import type { LoadedDataset } from './scene/loadDataset.ts';

const DAY = 86_400_000;
const T0 = Date.UTC(2024, 0, 1);

function dataset(n = 20) {
  const times = Float64Array.from({ length: n }, (_, i) => T0 + i * 10 * DAY);
  const cloud = {
    visible: new Uint8Array(n).fill(1),
    playheads: [] as (number | null)[],
    setVisibility(mask: Uint8Array | null) {
      if (mask) cloud.visible.set(mask);
      else cloud.visible.fill(1);
    },
    setPlayhead(day: number | null) {
      cloud.playheads.push(day);
    },
    setTimes() {},
  };
  const d = {
    schema: {
      columns: [{ name: 'time', type: 'timestamp' }],
      position: { kind: 'geo', lat: 'lat', lon: 'lon' },
      default_size_by: null,
      default_color_by: null,
    },
    base: { numRows: n, numbers: new Map([['time', times]]), strings: new Map() },
    cloud,
    shockwaves: null,
  };
  return { d: d as unknown as LoadedDataset, cloud };
}

function started() {
  const refresh = vi.fn();
  const host = {
    datasets: { active: 'quakes', session: () => ({ refresh, current: null }) },
    skipIntro: () => undefined,
    camera: {},
    xray: {},
  } as unknown as PlaygroundHost;
  const p = new Playground(host);
  const a = dataset();
  p.onDataset(a.d);
  p.onView(a.d);
  p.playYear();
  p.onFrame(1000, a.d); // a month into 190 days at the default speed
  expect(p.time.active).toBe(true);
  return { p, a, refresh };
}

describe('Playground time machine', () => {
  it('switching scene mid-replay turns the old replay off', () => {
    const { p, a } = started();
    expect(hudStore.introCutoff).not.toBeNull();
    p.onDataset(dataset().d);
    expect(a.cloud.playheads.at(-1)).toBeNull(); // the old cloud's glow is off
    expect(hudStore.introCutoff).toBeNull();
    expect(hudStore.introDate).toBe('');
  });

  it('Escape leaves the time machine and restores the selection', () => {
    const { p, a, refresh } = started();
    p.onKey('Escape');
    expect(p.time.active).toBe(false);
    expect(a.cloud.visible.every((v) => v === 1)).toBe(true);
    expect(hudStore.introDate).toBe('');
    expect(refresh).toHaveBeenCalled();
  });

  it('jumping to the very end of the strip leaves the time machine', () => {
    const { p } = started();
    p.seekFraction(0.5);
    expect(p.time.active).toBe(true);
    p.seekFraction(1);
    expect(p.time.active).toBe(false);
  });
});
