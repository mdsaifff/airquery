import { describe, expect, it } from 'vitest';
import type { QuerySpec } from '../contracts/contracts.ts';
import { easeInOutCubic, wantsXray, XrayState } from './xray.ts';

const spec = (over: Partial<QuerySpec>): QuerySpec => ({
  version: 1,
  dataset: 'quakes',
  intent: 'query',
  mode: 'refine',
  filters: [],
  color_by: null,
  size_by: null,
  sort: null,
  limit: null,
  camera_target: null,
  timeline: null,
  view: null,
  switch_to: null,
  ...over,
});

describe('wantsXray', () => {
  it('is on when the view colours, filters or sorts by depth', () => {
    expect(wantsXray(spec({ color_by: 'depth_km' }), 'depth_km')).toBe(true);
    expect(wantsXray(spec({ filters: [{ field: 'depth_km', op: '>', value: 300 }] }), 'depth_km')).toBe(true); // prettier-ignore
    expect(wantsXray(spec({ sort: { field: 'depth_km', direction: 'desc' } }), 'depth_km')).toBe(true); // prettier-ignore
  });

  it('is off otherwise, and without a depth column', () => {
    expect(wantsXray(spec({ color_by: 'magnitude' }), 'depth_km')).toBe(false);
    expect(wantsXray(null, 'depth_km')).toBe(false);
    expect(wantsXray(spec({ color_by: 'depth_km' }), null)).toBe(false);
  });
});

describe('XrayState', () => {
  it('follows the view only when "about depth" flips, so a manual toggle sticks', () => {
    const x = new XrayState();
    x.follow(false);
    expect(x.target).toBe(0);
    x.toggle(); // user turns it on
    x.follow(false); // a non-depth query: no flip, stays on
    expect(x.target).toBe(1);
    x.follow(true); // flips to depth: on
    x.follow(false); // flips back: off
    expect(x.target).toBe(0);
  });

  it('steps linearly to the target over the duration and reports motion', () => {
    const x = new XrayState();
    x.toggle();
    expect(x.step(600, 1200)).toBe(true);
    expect(x.mix).toBeCloseTo(0.5);
    x.step(600, 1200);
    expect(x.mix).toBe(1);
    expect(x.step(16, 1200)).toBe(false);
  });

  it('eases from 0 to 1 monotonically', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.25)).toBeLessThan(easeInOutCubic(0.5));
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });
});
