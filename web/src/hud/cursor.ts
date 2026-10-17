// Screen cursor and hold ring, updated imperatively (never through React state).
import type { Mode } from '../interaction/stateMachine.ts';

export const MODE_COLORS: Record<Mode, string> = {
  idle: '#7dd3fc',
  pointing: '#7dd3fc',
  rotating: '#facc15',
  zooming: '#facc15',
  clutched: '#f87171',
  listening: '#4ade80',
  circling: '#c4b5fd',
};

export class CursorView {
  readonly el: HTMLDivElement;
  private readonly ring: SVGCircleElement;
  private readonly label: HTMLSpanElement;
  private x = 0;
  private y = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'cursor';
    this.el.innerHTML =
      '<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="6" class="dot"/><circle cx="20" cy="20" r="16" class="ring" pathLength="1"/></svg><span class="cursor-label"></span>';
    const ring = this.el.querySelector<SVGCircleElement>('.ring');
    if (!ring) throw new Error('cursor svg');
    this.ring = ring;
    const label = this.el.querySelector<HTMLSpanElement>('.cursor-label');
    if (!label) throw new Error('cursor label');
    this.label = label;
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  get position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  get visible(): boolean {
    return this.el.style.display !== 'none';
  }

  set(visible: boolean, x?: number, y?: number): void {
    this.el.style.display = visible ? 'block' : 'none';
    if (x !== undefined && y !== undefined) {
      this.x = x;
      this.y = y;
      this.el.style.transform = `translate(${x - 20}px, ${y - 20}px)`;
    }
  }

  /** Colour by interaction mode; ring fills with hold progress (0..1). */
  style(mode: Mode, holdProgress: number): void {
    this.el.style.color = MODE_COLORS[mode];
    this.ring.style.strokeDashoffset = String(1 - holdProgress);
    this.ring.style.opacity = holdProgress > 0 ? '1' : '0';
    const text = mode === 'clutched' ? 'clutch' : mode === 'listening' ? 'listening' : mode === 'circling' ? 'circle' : ''; // prettier-ignore
    if (this.label.textContent !== text) this.label.textContent = text;
  }

  dispose(): void {
    this.el.remove();
  }
}
