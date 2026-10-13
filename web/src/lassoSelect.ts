// Air lasso (🤟 + index finger, or Shift+drag): draws the loop, selects the
// visible points inside it, focuses the scene on them until cleared (Esc or a
// new query). "What's this?" then summarizes the selection.
import * as THREE from 'three';
import { config } from './config.ts';
import type { Datasets } from './datasets.ts';
import { hudStore, toast } from './hud/store.ts';
import { LassoPath } from './interaction/lasso.ts';
import { pointsInPolygon } from './scene/picking.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const viewProj = new THREE.Matrix4();

export class LassoSelect {
  /** Indices of the selected points in the active dataset, or null. */
  selection: number[] | null = null;
  private readonly path = new LassoPath(config.lassoMinStepPx);
  private readonly svg: SVGSVGElement;
  private readonly line: SVGPolylineElement;
  private readonly datasets: Datasets;
  private readonly camera: THREE.PerspectiveCamera;

  constructor(parent: HTMLElement, datasets: Datasets, camera: THREE.PerspectiveCamera) {
    this.datasets = datasets;
    this.camera = camera;
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'lasso');
    this.line = document.createElementNS(SVG_NS, 'polyline');
    this.svg.appendChild(this.line);
    parent.appendChild(this.svg);
  }

  /** Driven by the state machine's lasso effects (and by Shift+drag). */
  step(step: 'start' | 'point' | 'end' | 'cancel', x?: number, y?: number): void {
    if (step === 'start') this.path.start();
    else if (step === 'point' && x !== undefined && y !== undefined) this.path.add(x, y);
    else if (step === 'end') this.select(this.path.finish());
    else this.path.cancel();
    this.line.setAttribute('points', this.path.points.map((p) => `${p.x},${p.y}`).join(' '));
  }

  /** Drop the selection and show the current query result again. */
  clear(): void {
    if (!this.selection) return;
    this.selection = null;
    this.datasets.session().refresh();
  }

  /** Shift+drag with the mouse draws a lasso instead of rotating. */
  attachMouse(el: HTMLElement): () => void {
    const down = (e: PointerEvent) => {
      if (!e.shiftKey) return;
      e.stopImmediatePropagation(); // not a rotate
      this.step('start');
      this.step('point', e.clientX, e.clientY);
    };
    const move = (e: PointerEvent) => {
      if (this.path.active && e.buttons) this.step('point', e.clientX, e.clientY);
    };
    const up = () => {
      if (this.path.active) this.step('end');
    };
    el.addEventListener('pointerdown', down, { capture: true });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true });
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
  }

  dispose(): void {
    this.svg.remove();
  }

  private select(poly: { x: number; y: number }[] | null): void {
    const d = this.datasets.current();
    if (!d || !poly) return;
    viewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    const picked = pointsInPolygon(
      {
        positions: d.cloud.positions,
        visible: d.cloud.visible,
        viewProj: viewProj.elements,
        camDist: this.camera.position.length(),
        camPos: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
        width: window.innerWidth,
        height: window.innerHeight,
      },
      poly,
      d.schema.position.kind === 'geo',
    );
    if (picked.length === 0) return toast('info', 'Nothing inside the loop.');
    this.selection = picked;
    const mask = new Uint8Array(d.cloud.count);
    for (const i of picked) mask[i] = 1;
    d.cloud.setVisibility(mask);
    hudStore.shown = picked.length;
    toast('info', `${picked.length} selected. Say "what's this?" · Esc clears.`);
  }
}
