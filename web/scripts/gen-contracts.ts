// Generates src/contracts/contracts.ts from contracts.schema.json (exported by the agent).
// Usage: node scripts/gen-contracts.ts [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { renderContracts } from './renderContracts.ts';

const SCHEMA = new URL('../src/contracts/contracts.schema.json', import.meta.url);
const OUT = new URL('../src/contracts/contracts.ts', import.meta.url);

const ts = await renderContracts(JSON.parse(readFileSync(SCHEMA, 'utf8')));
writeFileSync(OUT, ts);
console.log(`wrote ${OUT.pathname}`);
