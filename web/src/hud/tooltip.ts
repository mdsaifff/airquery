// Hover tooltip, positioned imperatively from the render loop.
export class TooltipView {
  private readonly el: HTMLDivElement;
  private shownFor = -1;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'tooltip';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  /** Show text for point `id` near (x, y); rebuilds content only when the point changes. */
  show(id: number, x: number, y: number, text: () => string): void {
    if (id !== this.shownFor || this.el.style.display === 'none') {
      this.el.textContent = text();
      this.shownFor = id;
    }
    this.el.style.display = 'block';
    this.el.style.transform = `translate(${x + 18}px, ${y + 18}px)`;
  }

  hide(): void {
    if (this.shownFor === -1) return;
    this.el.style.display = 'none';
    this.shownFor = -1;
  }

  dispose(): void {
    this.el.remove();
  }
}
