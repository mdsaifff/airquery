// Contract drift check, TS side: contracts.ts must equal what the schema generates.
// (agent/tests/test_contract.py checks spec.py -> contracts.schema.json.)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderContracts } from '../../scripts/renderContracts.ts';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');

describe('generated contracts', () => {
  it('contracts.ts is up to date with contracts.schema.json (run `make contracts`)', async () => {
    const fresh = await renderContracts(JSON.parse(read('./contracts.schema.json')));
    expect(read('./contracts.ts').replace(/\r\n/g, '\n')).toBe(fresh);
  });
});
