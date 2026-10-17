import { describe, expect, it } from 'vitest';
import { hudStore } from '../hud/store.ts';
import { Replier } from './reply.ts';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage; // prettier-ignore
}

describe('Replier', () => {
  it('speaks and subtitles each reply; a new one cuts off the old', () => {
    const log: string[] = [];
    const r = new Replier({ speak: (t) => log.push(`say:${t}`), stop: () => log.push('stop'), storage: fakeStorage() }); // prettier-ignore
    r.say('X-ray on.', 1000);
    r.say('Playing the year.', 1200);
    expect(log).toEqual(['stop', 'say:X-ray on.', 'stop', 'say:Playing the year.']);
    expect(hudStore.reply.text).toBe('Playing the year.');
    expect(hudStore.reply.until).toBeGreaterThan(1200 + 2500);
  });

  it('muted replies still subtitle', () => {
    const log: string[] = [];
    const r = new Replier({ speak: (t) => log.push(t), stop: () => undefined, storage: fakeStorage() }); // prettier-ignore
    r.setMuted(true);
    r.say('Stats hidden.', 0);
    expect(log).toEqual([]);
    expect(hudStore.reply.text).toBe('Stats hidden.');
    expect(hudStore.muted).toBe(true);
  });

  it('mute is remembered', () => {
    const storage = fakeStorage();
    new Replier({ speak: () => undefined, stop: () => undefined, storage }).setMuted(true);
    expect(new Replier({ speak: () => undefined, stop: () => undefined, storage }).muted).toBe(
      true,
    );
  });
});
