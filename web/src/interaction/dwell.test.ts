import { describe, expect, it } from 'vitest';
import { Dwell } from './dwell.ts';

describe('Dwell (point at a scene name and hold)', () => {
  it('fills while the cursor stays on one name, then fires once', () => {
    const d = new Dwell(800);
    expect(d.update('hurricanes', 0)).toEqual({ progress: 0, fire: null });
    expect(d.update('hurricanes', 400)).toEqual({ progress: 0.5, fire: null });
    expect(d.update('hurricanes', 800)).toEqual({ progress: 1, fire: 'hurricanes' });
    expect(d.update('hurricanes', 1600)).toEqual({ progress: 0, fire: null }); // once per stay
  });

  it('moving to another name or off the list starts again', () => {
    const d = new Dwell(800);
    d.update('hurricanes', 0);
    d.update('hurricanes', 700);
    expect(d.update('stars', 750)).toEqual({ progress: 0, fire: null });
    expect(d.update(null, 900)).toEqual({ progress: 0, fire: null });
    expect(d.update('stars', 1000).fire).toBeNull();
    expect(d.update('stars', 1800).fire).toBe('stars');
  });
});
