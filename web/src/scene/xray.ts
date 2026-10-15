// Pure X-ray state: the crust fades to glass and quakes sink to their real depth.
import type { QuerySpec } from '../contracts/contracts.ts';

/** True when the view is about depth: it colours by, filters on or sorts by the depth column. */
export function wantsXray(spec: QuerySpec | null, depthColumn: string | null): boolean {
  if (!spec || !depthColumn) return false;
  return (
    spec.color_by === depthColumn ||
    spec.sort?.field === depthColumn ||
    spec.filters.some((f) => f.field === depthColumn)
  );
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export class XrayState {
  /** 0 = solid crust, 1 = X-ray. */
  target = 0;
  /** Linear progress toward the target (0..1); draw with `eased`. */
  mix = 0;
  private lastAuto = false;

  /** Follow the view: only a flip of "is this about depth?" changes the target, so manual toggles stick until then. */
  follow(auto: boolean): void {
    if (auto === this.lastAuto) return;
    this.lastAuto = auto;
    this.target = auto ? 1 : 0;
  }

  toggle(): void {
    this.target = this.target ? 0 : 1;
  }

  /** Advance by dtMs over durationMs; true while moving. */
  step(dtMs: number, durationMs: number): boolean {
    if (this.mix === this.target) return false;
    const d = durationMs > 0 ? dtMs / durationMs : 1;
    this.mix =
      this.target > this.mix
        ? Math.min(this.target, this.mix + d)
        : Math.max(this.target, this.mix - d);
    return true;
  }

  get eased(): number {
    return easeInOutCubic(this.mix);
  }
}
