// Loads landmark fixtures recorded with Shift+R (see src/tracking/recorder.ts).
import { readFileSync, readdirSync } from 'node:fs';
import type { Fixture } from '../src/tracking/recorder.ts';

const DIR = new URL('./fixtures/', import.meta.url);

export function listFixtures(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f !== 'expected.json')
    .map((f) => f.replace(/\.json$/, ''));
}

export function loadFixture(name: string): Fixture {
  const data: unknown = JSON.parse(readFileSync(new URL(`${name}.json`, DIR), 'utf8'));
  if (
    typeof data !== 'object' ||
    data === null ||
    !('version' in data) ||
    data.version !== 1 ||
    !('frames' in data) ||
    !Array.isArray(data.frames)
  ) {
    throw new Error(`fixture ${name}: not a version-1 fixture`);
  }
  return data as Fixture;
}

/** Expected summarized event sequence per fixture name (see tests/replay.ts). */
export function loadExpected(): Record<string, string[] | undefined> {
  return JSON.parse(readFileSync(new URL('expected.json', DIR), 'utf8')) as Record<
    string,
    string[] | undefined
  >;
}
