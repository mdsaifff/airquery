import { describe, expect, it } from 'vitest';
import type { Columns } from './arrow.ts';
import { indexIds, maskFromResult } from './resultMask.ts';

const result = (ids: string[]): Columns => ({
  numRows: ids.length,
  numbers: new Map(),
  strings: new Map([['id', ids]]),
});

describe('maskFromResult', () => {
  it('marks the points in the result and counts them', () => {
    const index = indexIds(['a', 'b', 'c', 'd']);
    const mask = new Uint8Array(4).fill(1);
    expect(maskFromResult(result(['d', 'b', 'zzz', 'b']), 'id', index, mask)).toBe(2);
    expect([...mask]).toEqual([0, 1, 0, 1]);
  });

  it('fails loudly without the id column', () => {
    expect(() => maskFromResult(result([]), 'event_id', indexIds([]), new Uint8Array(0))).toThrow(
      /event_id/,
    );
  });
});
