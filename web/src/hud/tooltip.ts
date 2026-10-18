// Hover info card, positioned imperatively from the render loop. Built with
// textContent only: card strings can come from a user's CSV.
import type { Card } from './card.ts';

const W = 260;

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class TooltipView {
  private readonly el: HTMLDivElement;
  private shownFor = -1;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'tooltip';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  /** Show point `id`'s card near (x, y); rebuilds content only when the point changes. */
  show(id: number, x: number, y: number, card: () => Card): void {
    if (id !== this.shownFor || this.el.style.display === 'none') {
      this.render(card());
      this.shownFor = id;
    }
    this.el.style.display = 'block';
    const side = x + 18 + W > window.innerWidth ? x - 18 - W : x + 18;
    const left = Math.max(8, Math.min(side, window.innerWidth - W - 8)); // on screen on phones too
    const top = Math.min(y + 18, window.innerHeight - this.el.offsetHeight - 8);
    this.el.style.transform = `translate(${left}px, ${top}px)`;
  }

  hide(): void {
    if (this.shownFor === -1) return;
    this.el.style.display = 'none';
    this.shownFor = -1;
  }

  dispose(): void {
    this.el.remove();
  }

  private render(c: Card): void {
    const parts: HTMLElement[] = [el('div', 'card-title', c.title)];
    if (c.badge) {
      const b = el('div', `card-badge tone-${c.badge.label.toLowerCase()}`);
      b.append(el('span', 'mag', c.badge.value), el('span', 'cls', c.badge.label));
      parts.push(b);
    }
    if (c.gauge) {
      const g = el('div', 'card-gauge');
      const bar = el('div', 'bar');
      const fill = el('div', 'fill');
      fill.style.width = `${c.gauge.pct}%`;
      bar.append(fill);
      g.append(bar, el('div', 'gauge-label', c.gauge.label));
      parts.push(g);
    }
    if (c.rows.length) {
      const dl = el('dl', '');
      for (const [k, v] of c.rows) dl.append(el('dt', '', k), el('dd', '', v));
      parts.push(dl);
    }
    this.el.replaceChildren(...parts);
  }
}
