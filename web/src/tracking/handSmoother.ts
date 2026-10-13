// Applies a One Euro filter to every landmark of each hand. Pure apart from its
// own filter state; a hand's filters reset when that hand leaves the frame.
import type { Hand } from '../interaction/types.ts';
import type { HandsFrame } from './geometry.ts';
import { OneEuroFilter } from './oneEuroFilter.ts';
import type { OneEuroParams } from './oneEuroFilter.ts';

export class HandSmoother {
  private readonly params: OneEuroParams;
  private readonly filters = new Map<Hand, OneEuroFilter[]>();

  constructor(params: OneEuroParams) {
    this.params = params;
  }

  smooth(frame: HandsFrame): HandsFrame {
    const present = new Set(frame.hands.map((h) => h.hand));
    for (const hand of this.filters.keys()) if (!present.has(hand)) this.filters.delete(hand);
    return {
      t: frame.t,
      hands: frame.hands.map((h) => {
        let fs = this.filters.get(h.hand);
        if (!fs) {
          fs = Array.from({ length: h.points.length * 2 }, () => new OneEuroFilter(this.params));
          this.filters.set(h.hand, fs);
        }
        const filters = fs;
        return {
          ...h,
          points: h.points.map((p, i) => ({
            x: filters[2 * i].filter(p.x, frame.t),
            y: filters[2 * i + 1].filter(p.y, frame.t),
          })),
        };
      }),
    };
  }
}
