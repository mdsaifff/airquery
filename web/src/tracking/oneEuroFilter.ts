// One Euro filter (Casiez, Roussel & Vogel, CHI 2012): smooths jitter at low
// speed, follows quickly at high speed. Pure; time comes in as an argument.

export interface OneEuroParams {
  /** Cutoff at rest (Hz). Lower = smoother, more lag. */
  minCutoff: number;
  /** Cutoff increase per unit of speed (Hz per unit/s). Higher = less lag when moving. */
  beta: number;
  /** Cutoff for the speed estimate (Hz). */
  dCutoff: number;
}

const alpha = (cutoffHz: number, dtS: number) => 1 / (1 + 1 / (2 * Math.PI * cutoffHz * dtS));

export class OneEuroFilter {
  private readonly params: OneEuroParams;
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  /** params is read on every sample, so live edits (debug panel) apply immediately. */
  constructor(params: OneEuroParams) {
    this.params = params;
  }

  filter(value: number, tMs: number): number {
    if (this.x === null || tMs <= this.t) {
      if (this.x === null) this.x = value;
      this.t = tMs;
      return this.x;
    }
    const dt = (tMs - this.t) / 1000;
    this.t = tMs;
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.params.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset(): void {
    this.x = null;
    this.dx = 0;
  }
}
