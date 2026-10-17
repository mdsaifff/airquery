import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from './share.ts';
import type { ShareState } from './share.ts';

const state: ShareState = {
  v: 1,
  dataset: 'quakes',
  spec: {
    version: 1,
    dataset: 'quakes',
    intent: 'query',
    mode: 'replace',
    filters: [{ field: 'place', op: 'contains', value: 'Japón ✓' }],
    color_by: null,
    size_by: null,
    sort: null,
    limit: null,
    camera_target: null,
    timeline: null,
    view: null,
  },
  orbit: { yaw: 2.6, pitch: 0.3, distance: 3.2 },
  xray: true,
  day: 120.5,
};

describe('share links', () => {
  it('round-trips a view through a URL-safe hash (unicode included)', () => {
    const hash = encodeShare(state);
    expect(hash).toMatch(/^#v=[A-Za-z0-9_-]+$/);
    expect(decodeShare(hash)).toEqual(state);
  });

  it('rejects garbage, wrong version and oversized hashes', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#v=!!!')).toBeNull();
    expect(decodeShare('#v=e30')).toBeNull(); // {}
    expect(decodeShare(encodeShare({ ...state, v: 2 } as unknown as ShareState))).toBeNull();
    expect(decodeShare(`#v=${'A'.repeat(5000)}`)).toBeNull();
  });
});
