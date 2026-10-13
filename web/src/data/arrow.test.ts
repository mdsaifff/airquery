import { Float32, Int64, Table, TimestampMicrosecond, Utf8, vectorFromArray } from 'apache-arrow';
import { describe, expect, it } from 'vitest';
import { arrowToColumns } from './arrow.ts';

describe('arrowToColumns', () => {
  it('converts floats, bigints, timestamps and strings', () => {
    const table = new Table({
      depth: vectorFromArray(new Float64Array([10, 300.5])),
      mag: vectorFromArray([4.5, 6], new Float32()),
      n: vectorFromArray([1n, 2n], new Int64()),
      time: vectorFromArray(
        [new Date('2024-01-02T03:04:05.678Z'), new Date('2024-06-01T00:00:00Z')],
        new TimestampMicrosecond(),
      ),
      place: vectorFromArray(['Japan', 'Chile'], new Utf8()),
    });

    const cols = arrowToColumns(table);
    expect(cols.numRows).toBe(2);
    expect(cols.numbers.get('depth')).toEqual(new Float64Array([10, 300.5]));
    expect(cols.numbers.get('mag')).toEqual(new Float64Array([4.5, 6]));
    expect(cols.numbers.get('n')).toEqual(new Float64Array([1, 2]));
    expect(cols.numbers.get('time')).toEqual(
      new Float64Array([
        Date.parse('2024-01-02T03:04:05.678Z'),
        Date.parse('2024-06-01T00:00:00Z'),
      ]),
    );
    expect(cols.strings.get('place')).toEqual(['Japan', 'Chile']);
  });
});
