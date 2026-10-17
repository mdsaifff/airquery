import { describe, expect, it } from 'vitest';
import { blankSpec, refine } from './refine.ts';

const DEEP = { field: 'depth_km', op: '>' as const, value: 300 };
const BIG = { field: 'magnitude', op: '>=' as const, value: 6 };

describe('refine', () => {
  it('adds a filter to a blank view', () => {
    const s = refine(null, 'quakes', DEEP);
    expect(s).toEqual({ ...blankSpec('quakes'), filters: [DEEP] });
  });

  it('replaces a filter on the same field and keeps the rest', () => {
    const now = { ...blankSpec('quakes'), filters: [DEEP, BIG] };
    const shallow = { field: 'depth_km', op: '<' as const, value: 70 };
    expect(refine(now, 'quakes', shallow).filters).toEqual([BIG, shallow]);
  });

  it('keeps colour, size, sort and limit, and drops any camera target', () => {
    const now = {
      ...blankSpec('quakes'),
      color_by: 'magnitude',
      sort: { field: 'magnitude', direction: 'desc' as const },
      limit: 25,
      camera_target: { lat: 1, lon: 2, label: 'x' },
    };
    const s = refine(now, 'quakes', DEEP);
    expect(s).toMatchObject({
      color_by: 'magnitude',
      limit: 25,
      camera_target: null,
      mode: 'replace',
    });
  });
});
