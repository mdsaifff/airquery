// Pure: two-finger pinch on a touch screen -> zoom scale per move (>1 = fingers apart).
export class Pinch {
  private readonly pts = new Map<number, { x: number; y: number }>();
  private last: number | null = null;

  get count(): number {
    return this.pts.size;
  }

  down(id: number, x: number, y: number): void {
    this.pts.set(id, { x, y });
    this.last = this.spread();
  }

  move(id: number, x: number, y: number): number | null {
    if (!this.pts.has(id)) return null;
    this.pts.set(id, { x, y });
    const s = this.spread();
    const k = s !== null && this.last ? s / this.last : null;
    this.last = s;
    return k;
  }

  up(id: number): void {
    this.pts.delete(id);
    this.last = this.spread();
  }

  private spread(): number | null {
    if (this.pts.size < 2) return null;
    const [a, b] = [...this.pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
