// Per-frame hover: pick the point under the hand cursor or mouse, show its tooltip.
import * as THREE from 'three';
import { config } from '../config.ts';
import type { Columns } from '../data/arrow.ts';
import type { GlobeScene } from '../scene/globeScene.ts';
import { pickNearest } from '../scene/picking.ts';
import { TooltipView } from './tooltip.ts';

const viewProj = new THREE.Matrix4();

export function describeQuake(base: Columns, i: number): string {
  const place = base.strings.get('place')?.[i] || 'Unknown place';
  const mag = base.numbers.get('magnitude')?.[i] ?? NaN;
  const depth = base.numbers.get('depth_km')?.[i] ?? NaN;
  const time = base.numbers.get('time')?.[i];
  const date = time === undefined ? '' : new Date(time).toISOString().slice(0, 10);
  return `${place}\nM${mag.toFixed(1)} · ${depth.toFixed(0)} km deep · ${date}`;
}

export class Hover {
  /** Index of the point under the pointer, or -1. */
  current = -1;
  private readonly tooltip: TooltipView;
  private mouse: { x: number; y: number } | null = null;
  private readonly el: HTMLElement;
  private readonly onMove = (e: PointerEvent) => {
    this.mouse = e.buttons ? null : { x: e.clientX, y: e.clientY }; // no hover while dragging
  };
  private readonly onLeave = () => {
    this.mouse = null;
  };

  constructor(parent: HTMLElement, el: HTMLElement) {
    this.tooltip = new TooltipView(parent);
    this.el = el;
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerleave', this.onLeave);
  }

  /** handCursor wins over the mouse when a hand is up. */
  update(
    camera: THREE.PerspectiveCamera,
    globe: GlobeScene,
    base: Columns,
    handCursor: { x: number; y: number } | null,
    canPick: boolean,
  ): void {
    const at = handCursor ?? this.mouse;
    if (!at || !canPick) {
      this.current = -1;
      this.tooltip.hide();
      return;
    }
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const i = pickNearest({
      positions: globe.positions,
      visible: globe.visible,
      viewProj: viewProj.elements,
      camDist: camera.position.length(),
      camPos: [camera.position.x, camera.position.y, camera.position.z],
      width: window.innerWidth,
      height: window.innerHeight,
      x: at.x,
      y: at.y,
      radiusPx: config.pickRadiusPx,
    });
    this.current = i;
    if (i < 0) this.tooltip.hide();
    else this.tooltip.show(i, at.x, at.y, () => describeQuake(base, i));
  }

  dispose(): void {
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerleave', this.onLeave);
    this.tooltip.dispose();
  }
}
