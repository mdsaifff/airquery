// Opening replay: the year plays back, points popping in by date, while the camera glides in.

export function introCutoff(progress: number, tMin: number, tMax: number): number {
  return tMin + Math.min(1, Math.max(0, progress)) * (tMax - tMin);
}

/** out[i] = 1 for rows at or before the cutoff; returns how many. */
export function introMask(times: ArrayLike<number>, cutoff: number, out: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < times.length; i++) {
    const on = times[i] <= cutoff ? 1 : 0;
    out[i] = on;
    n += on;
  }
  return n;
}

export class IntroPlayer {
  private readonly times: ArrayLike<number> | null;
  private readonly durationMs: number;
  private readonly tMin: number;
  private readonly tMax: number;
  private start = 0;
  private running = false;

  constructor(times: ArrayLike<number> | null, durationMs: number) {
    this.times = times;
    this.durationMs = durationMs;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < (times?.length ?? 0); i++) {
      const t = times ? times[i] : NaN;
      if (Number.isFinite(t)) [lo, hi] = [Math.min(lo, t), Math.max(hi, t)];
    }
    this.tMin = lo;
    this.tMax = hi;
  }

  get active(): boolean {
    return this.running;
  }

  begin(now: number): void {
    this.start = now;
    this.running = true;
  }

  /** End on the next step (any user input, or a query arriving). */
  skip(): void {
    this.start = -Infinity;
  }

  step(now: number, out: Uint8Array): { cutoff: number | null; shown: number; done: boolean } {
    const progress = (now - this.start) / this.durationMs;
    const done = !this.running || progress >= 1;
    if (done) this.running = false;
    if (!this.times || !Number.isFinite(this.tMin)) return { cutoff: null, shown: 0, done };
    const cutoff = introCutoff(progress, this.tMin, this.tMax);
    return { cutoff, shown: introMask(this.times, cutoff, out), done };
  }
}
