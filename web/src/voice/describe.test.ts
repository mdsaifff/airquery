import { describe, expect, it } from 'vitest';
import type { QuerySpec } from '../contracts/contracts.ts';
import type { Dashboard } from '../hud/dashboard.ts';
import { describeView, timelineSentence, viewSentence } from './describe.ts';

const blank: QuerySpec = {
  version: 1, dataset: 'quakes', intent: 'query', mode: 'replace', filters: [],
  color_by: null, size_by: null, sort: null, limit: null, camera_target: null, timeline: null, view: null,
}; // prettier-ignore
const dash: Dashboard = {
  count: 314,
  maxSize: 7.1,
  medianDepth: 540,
  charts: [{ key: 'text', title: 'Top regions', field: 'place', kind: 'text', bars: [{ label: 'Fiji', count: 120, lo: 0, hi: 0, closed: true }] }],
}; // prettier-ignore

describe('spoken replies', () => {
  it('describes a filtered view with numbers from the data', () => {
    const spec = { ...blank, filters: [{ field: 'depth_km', op: '>' as const, value: 300 }] };
    expect(describeView(spec, dash, 'quakes')).toBe(
      '314 quakes deeper than 300 km, mostly near Fiji, strongest magnitude 7.1.',
    );
  });

  it('describes everything when nothing is filtered, and nothing at all', () => {
    expect(describeView(blank, { ...dash, count: 6397 }, 'quakes')).toMatch(/^All 6,397 quakes/);
    expect(describeView(blank, { ...dash, count: 0, charts: [] }, 'quakes')).toBe(
      'No quakes match that.',
    );
  });

  it('confirms timeline and view commands', () => {
    expect(timelineSentence({ action: 'play', date: null, speed: 'month' }, 'Jan 1, 2024')).toBe('Playing the year, a month per second.'); // prettier-ignore
    expect(timelineSentence({ action: 'seek', date: '2024-03-01', speed: null }, 'Mar 1, 2024')).toBe('Jumped to Mar 1, 2024.'); // prettier-ignore
    expect(timelineSentence({ action: 'stop', date: null, speed: null }, '')).toBe('Back to the whole year.'); // prettier-ignore
    expect(viewSentence({ xray: true, stats: null, share: null, mute: null })).toBe('X-ray on.');
    expect(viewSentence({ xray: null, stats: false, share: null, mute: true })).toBe('Stats hidden. Voice off.'); // prettier-ignore
  });
});
