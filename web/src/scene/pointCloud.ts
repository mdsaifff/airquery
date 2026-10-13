// Every row of a dataset as one THREE.Points with a single BufferGeometry.
// Queries change per-point alpha/colour/size in place; points are never added
// or removed. Dataset-agnostic: positions come from positions.ts.
import * as THREE from 'three';
import { config } from '../config.ts';
import { CATEGORY_COLORS, OTHER_COLOR, rampColor } from './colorRamp.ts';
import { createPointsMaterial } from './pointsMaterial.ts';

export class PointCloud {
  readonly count: number;
  /** World positions, xyz per point (shared with picking). */
  readonly positions: Float32Array;
  /** Target visibility per point: 1 shown, 0 hidden. */
  readonly visible: Uint8Array;
  /** Everything this dataset draws (points + any decoration), for show/hide. */
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly alpha: Float32Array;
  private animating = false;

  constructor(scene: THREE.Scene, positions: Float32Array, farDim = config.farSideDim) {
    this.count = positions.length / 3;
    this.positions = positions;
    this.visible = new Uint8Array(this.count).fill(1);
    this.alpha = new Float32Array(this.count).fill(1);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3)); // prettier-ignore
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(this.count), 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.material = createPointsMaterial(farDim);
    const points = new THREE.Points(this.geometry, this.material);
    points.renderOrder = 0;
    points.frustumCulled = false;
    this.group.add(points);
    scene.add(this.group);
  }

  /** Colour each point by value, mapped through the sequential ramp over [min, max]. */
  setColors(values: ArrayLike<number>, min: number, max: number): void {
    const attr = this.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const out = attr.array as Float32Array;
    const span = max - min || 1;
    for (let i = 0; i < this.count; i++) rampColor((values[i] - min) / span, out, i * 3);
    attr.needsUpdate = true;
  }

  /** Categorical colour: the first categories get fixed palette slots, the rest grey. */
  setCategoryColors(values: readonly string[], categories: readonly string[]): void {
    const attr = this.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const out = attr.array as Float32Array;
    const slot = new Map(categories.slice(0, CATEGORY_COLORS.length).map((c, i) => [c, i]));
    for (let i = 0; i < this.count; i++) {
      const k = slot.get(values[i]);
      out.set(k === undefined ? OTHER_COLOR : CATEGORY_COLORS[k], i * 3);
    }
    attr.needsUpdate = true;
  }

  /** Size each point by value over [min, max] (or all the same when values is null). */
  setSizes(values: ArrayLike<number> | null, min: number, max: number): void {
    const attr = this.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const out = attr.array as Float32Array;
    const { pointMinSize: lo, pointMaxSize: hi } = config;
    const span = max - min || 1;
    for (let i = 0; i < this.count; i++) {
      const t = values ? Math.min(1, Math.max(0, (values[i] - min) / span)) : 0.25;
      out[i] = lo + t ** 1.5 * (hi - lo);
    }
    attr.needsUpdate = true;
  }

  /** Set which points should be shown; alpha animates there over `filterAnimMs`. */
  setVisibility(mask: Uint8Array | null): void {
    if (mask) this.visible.set(mask);
    else this.visible.fill(1);
    this.animating = true;
  }

  update(dt: number, camDist: number, pixelScale: number): void {
    this.material.uniforms.uCamDist.value = camDist;
    this.material.uniforms.uPixelScale.value = pixelScale;
    if (!this.animating) return;
    const step = dt / config.filterAnimMs;
    let moving = false;
    for (let i = 0; i < this.count; i++) {
      const target = this.visible[i];
      const a = this.alpha[i];
      if (a === target) continue;
      this.alpha[i] = target > a ? Math.min(target, a + step) : Math.max(target, a - step);
      moving = true;
    }
    this.geometry.getAttribute('aAlpha').needsUpdate = true;
    this.animating = moving;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.Points ||
        obj instanceof THREE.LineSegments
      ) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }
}
