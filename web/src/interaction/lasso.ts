// Pure lasso path: collects cursor points while drawing, closes into a polygon.
export interface Pt {
  x: number;
  y: number;
}

export class LassoPath {
  points: Pt[] = [];
  private readonly minStepPx: number;
  active = false;

  constructor(minStepPx: number) {
    this.minStepPx = minStepPx;
  }

  start(): void {
    this.points = [];
    this.active = true;
  }

  /** Adds a point if it moved far enough from the last one (keeps the path light). */
  add(x: number, y: number): void {
    if (!this.active) return;
    const last = this.points.at(-1);
    if (!last || Math.hypot(x - last.x, y - last.y) >= this.minStepPx) this.points.push({ x, y });
  }

  /** Ends drawing. Returns the polygon, or null if it encloses (almost) nothing. */
  finish(minAreaPx2 = 400): Pt[] | null {
    this.active = false;
    const poly = this.points;
    this.points = [];
    return poly.length >= 3 && Math.abs(area(poly)) >= minAreaPx2 ? poly : null;
  }

  cancel(): void {
    this.active = false;
    this.points = [];
  }
}

/** Shoelace area (px², signed). */
export function area(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return a / 2;
}
