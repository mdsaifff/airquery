// Pure: point at a target and hold still to choose it (a ring fills, then it fires once).

export class Dwell {
  private readonly ms: number;
  private target: string | null = null;
  private since = 0;
  private fired = false;

  constructor(ms: number) {
    this.ms = ms;
  }

  /** Feed what is under the cursor each frame (null: nothing); t in ms. */
  update(target: string | null, t: number): { progress: number; fire: string | null } {
    if (target !== this.target) [this.target, this.since, this.fired] = [target, t, false];
    if (target === null || this.fired) return { progress: 0, fire: null };
    const progress = Math.min(1, (t - this.since) / this.ms);
    if (progress < 1) return { progress, fire: null };
    this.fired = true;
    return { progress: 1, fire: target };
  }
}
