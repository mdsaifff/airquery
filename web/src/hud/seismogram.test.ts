import { describe, expect, it } from 'vitest';
import { MIN_AMP, binStrip, timeTicks } from './seismogram.ts';

const day = 86_400_000;
const jan1 = Date.UTC(2024, 0, 1);

describe('binStrip', () => {
  it('keeps the strongest visible event per column and the hidden ones apart', () => {
    const times = [jan1, jan1 + 1, jan1 + 10 * day];
    const mags = [5, 7, 4.5];
    const s = binStrip(times, mags, [1, 1, 0], 10);
    expect(s.shownRow[0]).toBe(1); // M7 beats M5 in the same slice
    expect(s.shown[0]).toBeCloseTo(1);
    expect(s.hidden[9]).toBeCloseTo(MIN_AMP); // weakest event: smallest mark
    expect(s.shown[9]).toBe(0);
    expect(s.shownRow[5]).toBe(-1);
  });

  it('copes with no weights and empty input', () => {
    expect(binStrip([jan1, jan1 + day], null, [1, 1], 4).shown[3]).toBeGreaterThan(0);
    expect(binStrip([], null, [], 4).shownRow[0]).toBe(-1);
  });
});

describe('timeTicks', () => {
  it('labels months across one year', () => {
    const t = timeTicks(jan1, Date.UTC(2024, 11, 31));
    expect(t.map((x) => x.label)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']); // prettier-ignore
    expect(t[0].at).toBe(0);
    expect(t[6].at).toBeCloseTo(0.5, 1);
  });

  it('labels years across a long span', () => {
    expect(timeTicks(Date.UTC(2019, 5, 1), Date.UTC(2022, 5, 1)).map((x) => x.label)).toEqual(['2020', '2021', '2022']); // prettier-ignore
  });
});
