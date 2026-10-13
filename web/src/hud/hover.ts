// Per-frame hover: pick the point under the hand cursor or mouse, show its tooltip.
import * as THREE from 'three';
import { config } from '../config.ts';
import type { Columns } from '../data/arrow.ts';
import type { DatasetSchema } from '../contracts/contracts.ts';
import type { PointCloud } from '../scene/pointCloud.ts';
import { pickNearest, pointsWithin } from '../scene/picking.ts';
import type { PickInput } from '../scene/picking.ts';
import { TooltipView } from './tooltip.ts';

const viewProj = new THREE.Matrix4();

function pickInput(
  camera: THREE.PerspectiveCamera,
  cloud: PointCloud,
  at: { x: number; y: number },
  radiusPx: number,
): PickInput {
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return {
    positions: cloud.positions,
    visible: cloud.visible,
    viewProj: viewProj.elements,
    camDist: camera.position.length(),
    camPos: [camera.position.x, camera.position.y, camera.position.z],
    width: window.innerWidth,
    height: window.innerHeight,
    x: at.x,
    y: at.y,
    radiusPx,
  };
}

export function describePoint(schema: DatasetSchema, base: Columns, i: number): string {
  if (schema.dataset === 'papers') return describePaper(base, i);
  return describeQuake(base, i);
}

function describePaper(base: Columns, i: number): string {
  const title = base.strings.get('title')?.[i] ?? '';
  const year = base.numbers.get('year')?.[i];
  const field = base.strings.get('field')?.[i] ?? '';
  const id = base.strings.get('id')?.[i] ?? '';
  const short = title.length > 70 ? `${title.slice(0, 67)}…` : title;
  return `${short}
${year ?? ''} · ${field} · arxiv.org/abs/${id}`;
}

function describeQuake(base: Columns, i: number): string {
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
  /** Where the hand cursor or mouse last was (px), for "what's this?". */
  pointer: { x: number; y: number } | null = null;
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
    globe: PointCloud,
    base: Columns,
    schema: DatasetSchema,
    handCursor: { x: number; y: number } | null,
    canPick: boolean,
  ): void {
    const at = handCursor ?? this.mouse;
    if (at) this.pointer = at;
    if (!at || !canPick) {
      this.current = -1;
      this.tooltip.hide();
      return;
    }
    const i = pickNearest(pickInput(camera, globe, at, config.pickRadiusPx));
    this.current = i;
    if (i < 0) this.tooltip.hide();
    else this.tooltip.show(i, at.x, at.y, () => describePoint(schema, base, i));
  }

  /** Visible points within radiusPx of the last pointer position (front side only for globes). */
  nearby(
    camera: THREE.PerspectiveCamera,
    cloud: PointCloud,
    radiusPx: number,
    skipBehind: boolean,
  ): number[] {
    // prettier-ignore
    if (!this.pointer) return [];
    return pointsWithin(pickInput(camera, cloud, this.pointer, radiusPx), skipBehind);
  }

  dispose(): void {
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerleave', this.onLeave);
    this.tooltip.dispose();
  }
}
