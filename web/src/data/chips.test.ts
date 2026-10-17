import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QuerySpecSchema } from './agentClient.ts';
import { blankSpec } from './refine.ts';
import { chipSpec, ChipsSchema, surprise } from './chips.ts';

const raw: unknown = JSON.parse(
  readFileSync(new URL('../../public/data/quakes.chips.json', import.meta.url), 'utf8'),
);

describe('chips', () => {
  it('every quakes chip parses and becomes a full QuerySpec; six are pinned; labels unique', () => {
    const chips = ChipsSchema.parse(raw);
    expect(chips.filter((c) => c.pinned)).toHaveLength(6);
    expect(new Set(chips.map((c) => c.label)).size).toBe(chips.length);
    for (const c of chips)
      expect(QuerySpecSchema.parse(chipSpec(c, 'quakes')).dataset).toBe('quakes');
  });

  it('surprise never picks what is already on screen', () => {
    const chips = ChipsSchema.parse(raw);
    const onScreen = chipSpec(chips[0], 'quakes');
    for (let k = 0; k < 20; k++) {
      const pick = surprise(chips, 'quakes', onScreen, () => k / 20);
      expect(chipSpec(pick, 'quakes')).not.toEqual(onScreen);
    }
  });

  it('surprise still answers when every chip matches the screen', () => {
    const one = ChipsSchema.parse([{ label: 'All', spec: {} }]);
    expect(surprise(one, 'quakes', blankSpec('quakes')).label).toBe('All');
  });
});
