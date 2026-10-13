// Arrow table -> plain columns, allocating one array per column per query.
import { DataType, DateUnit, TimeUnit } from 'apache-arrow';
import type { Table, Vector } from 'apache-arrow';

export interface Columns {
  numRows: number;
  /** Numeric, timestamp (epoch ms) and date (epoch ms) columns. */
  numbers: Map<string, Float64Array>;
  strings: Map<string, string[]>;
}

const MS_PER_TIME_UNIT: Record<TimeUnit, number> = {
  [TimeUnit.SECOND]: 1000,
  [TimeUnit.MILLISECOND]: 1,
  [TimeUnit.MICROSECOND]: 1e-3,
  [TimeUnit.NANOSECOND]: 1e-6,
};

function toFloat64(values: ArrayLike<number | bigint>, scale = 1): Float64Array {
  if (values instanceof Float64Array && scale === 1) return values;
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = Number(values[i]) * scale;
  return out;
}

function numbersOf(vec: Vector): ArrayLike<number | bigint> {
  return vec.toArray() as ArrayLike<number | bigint>;
}

export function arrowToColumns(table: Table): Columns {
  const cols: Columns = { numRows: table.numRows, numbers: new Map(), strings: new Map() };
  for (const field of table.schema.fields) {
    const vec = table.getChild(field.name);
    if (!vec) continue;
    const type = field.type;
    if (DataType.isFloat(type) || DataType.isInt(type) || DataType.isDecimal(type)) {
      cols.numbers.set(field.name, toFloat64(numbersOf(vec)));
    } else if (DataType.isTimestamp(type)) {
      cols.numbers.set(field.name, toFloat64(numbersOf(vec), MS_PER_TIME_UNIT[type.unit]));
    } else if (DataType.isDate(type)) {
      const scale = type.unit === DateUnit.DAY ? 86_400_000 : 1;
      cols.numbers.set(field.name, toFloat64(numbersOf(vec), scale));
    } else {
      cols.strings.set(field.name, Array.from(vec.toArray() as ArrayLike<unknown>, String));
    }
  }
  return cols;
}
