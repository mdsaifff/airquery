// Which scene name in the scene list ([data-scene]) is under a point on the scene (px), if any.
export function sceneAt(root: HTMLElement, x: number, y: number): string | null {
  const r = root.getBoundingClientRect();
  for (const el of document.elementsFromPoint(r.left + x, r.top + y)) {
    const name = el.closest('[data-scene]')?.getAttribute('data-scene');
    if (name) return name;
  }
  return null;
}
