// The time machine: a playhead over the dataset's time range. Points the query shows
// appear when the playhead reaches them. Pure apart from the cloud it is handed.
import { config } from '../config.ts';

export const DAY_MS = 86_400_000;

/** The UTC start of an ISO date's calendar day ("2024-06-05", "…T00:00:00Z", "…+00:00"). */
export function dayStartMs(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

export interface TimedCloud {
  readonly visible: Uint8Array;
  setVisibility(mask: Uint8Array | null): void;
  setPlayhead(day: number | null, glowDays: number): void;
}

export class TimeMachine {
  playing = false;
  speed: number = config.timeDefaultSpeed;
  day = 0;
  totalDays = 0;
  private times: ArrayLike<number> | null = null;
  private t0 = 0;
  private base = new Uint8Array(0);
  private out = new Uint8Array(0);
  private on = false;
  private dirty = false;
  private lastCutoff = -Infinity;

  attach(times: ArrayLike<number> | null): void {
    this.times = times;
    this.on = false;
    this.playing = false;
    if (!times) return;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      if (Number.isFinite(t)) [lo, hi] = [Math.min(lo, t), Math.max(hi, t)];
    }
    this.t0 = lo;
    this.totalDays = hi >= lo ? (hi - lo) / DAY_MS : 0;
    this.base = new Uint8Array(times.length);
    this.out = new Uint8Array(times.length);
  }

  get available(): boolean {
    return this.times !== null && this.totalDays > 0;
  }

  /** A cutoff applies (playing, or paused part-way). */
  get active(): boolean {
    return this.on;
  }

  cutoffMs(): number {
    return this.t0 + this.day * DAY_MS;
  }

  /** The query's selection changed (or was re-shown): mask from it from now on. */
  onView(visible: Uint8Array): void {
    if (this.base.length === visible.length) this.base.set(visible);
    this.dirty = true;
  }

  play(fromStart = false): void {
    if (!this.available) return;
    if (fromStart || this.day >= this.totalDays) this.day = 0;
    this.lastCutoff = fromStart ? -Infinity : this.cutoffMs();
    this.on = true;
    this.playing = true;
    this.dirty = true;
  }

  pause(): void {
    this.playing = false;
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play(!this.on);
  }

  seek(day: number): void {
    if (!this.available) return;
    this.day = Math.min(this.totalDays, Math.max(0, day));
    this.lastCutoff = this.cutoffMs(); // no ripple burst for a jump
    this.on = true;
    this.playing = false;
    this.dirty = true;
  }

  /** Jump to a calendar time (epoch ms), paused; a bad date (NaN) changes nothing. */
  seekDate(ms: number): void {
    if (Number.isFinite(ms)) this.seek((ms - this.t0) / DAY_MS);
  }

  seekFraction(f: number): void {
    this.seek(f * this.totalDays);
  }

  setSpeed(daysPerSec: number): void {
    this.speed = daysPerSec;
  }

  stop(cloud: TimedCloud): void {
    if (!this.on) return;
    this.on = false;
    this.playing = false;
    cloud.setVisibility(this.base);
    cloud.setPlayhead(null, 1);
  }

  step(
    dtMs: number,
    cloud: TimedCloud,
  ): { shown: number; arrived: number[]; ended: boolean } | null {
    if (!this.on || !this.times) return null;
    const before = this.day;
    if (this.playing) this.day = Math.min(this.totalDays, this.day + (this.speed * dtMs) / 1000);
    if (this.playing && this.day >= this.totalDays) {
      this.stop(cloud);
      return { shown: 0, arrived: [], ended: true };
    }
    if (this.day === before && !this.dirty) return { shown: -1, arrived: [], ended: false };
    this.dirty = false;
    const cutoff = this.cutoffMs();
    const arrived: number[] = [];
    let shown = 0;
    for (let i = 0; i < this.times.length; i++) {
      const t = this.times[i];
      const on = this.base[i] && t <= cutoff ? 1 : 0;
      this.out[i] = on;
      shown += on;
      if (on && t > this.lastCutoff) arrived.push(i);
    }
    this.lastCutoff = cutoff;
    cloud.setVisibility(this.out);
    cloud.setPlayhead(this.day, Math.max(0.5, this.speed * config.timeGlowSec));
    return { shown, arrived, ended: false };
  }
}
