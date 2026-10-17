// Every row of a dataset as one THREE.Points with a single BufferGeometry.
// Queries change per-point alpha/colour/size in place; points are never added
// or removed. Dataset-agnostic: positions come from positions.ts.
import * as THREE from 'three';
import { config } from '../config.ts';
import { CATEGORY_COLORS, OTHER_COLOR, rampColor, rampPosition } from './colorRamp.ts';
import { createPointsMaterial } from './pointsMaterial.ts';

export class PointCloud {
  readonly count: number;
  /** Where points are drawn right now, xyz per point (blend of surface and depth); picking reads this. */
  readonly positions: Float32Array;
  /** X-ray off / on positions; the same array when the dataset has no depth. */
  readonly surfacePositions: Float32Array;
  readonly depthPositions: Float32Array;
  /** Target visibility per point: 1 shown, 0 hidden. */
  readonly visible: Uint8Array;
  /** Everything this dataset draws (points + any decoration), for show/hide. */
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly alpha: Float32Array;
  private animating = false;
  private depthMix = 0;

  constructor(
    scene: THREE.Scene,
    positions: Float32Array,
    farDim = config.farSideDim,
    surface: Float32Array | null = null,
  ) {
    this.count = positions.length / 3;
    this.depthPositions = positions;
    this.surfacePositions = surface ?? positions;
    this.positions = surface ? new Float32Array(surface) : positions;
    this.visible = new Uint8Array(this.count).fill(1);
    this.alpha = new Float32Array(this.count).fill(1);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aSurface', new THREE.BufferAttribute(this.surfacePositions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3)); // prettier-ignore
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(this.count), 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geometry.setAttribute('aTime', new THREE.BufferAttribute(new Float32Array(this.count), 1));
    this.material = createPointsMaterial(farDim);
    const points = new THREE.Points(this.geometry, this.material);
    points.renderOrder = 0;
    points.frustumCulled = false;
    this.group.add(points);
    scene.add(this.group);
  }

  /** Colour each point by value, mapped through the sequential ramp over [min, max]
   *  (logarithmic for positive data spanning 1000x or more, see rampPosition). */
  setColors(values: ArrayLike<number>, min: number, max: number): void {
    const attr = this.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const out = attr.array as Float32Array;
    for (let i = 0; i < this.count; i++) rampColor(rampPosition(values[i], min, max), out, i * 3);
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
    for (let i = 0; i < this.count; i++) {
      const t = values ? rampPosition(values[i], min, max) : 0.25;
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

  /** Days since t0 per point (for the time machine's glow); missing times never glow. */
  setTimes(times: ArrayLike<number>, t0: number): void {
    const attr = this.geometry.getAttribute('aTime') as THREE.BufferAttribute;
    const out = attr.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const t = times[i];
      out[i] = Number.isFinite(t) ? (t - t0) / 86_400_000 : -1e6;
    }
    attr.needsUpdate = true;
  }

  get times(): Float32Array {
    return (this.geometry.getAttribute('aTime') as THREE.BufferAttribute).array as Float32Array;
  }

  /** Time machine playhead (days since t0), or null when it is off. */
  setPlayhead(day: number | null, glowDays: number): void {
    const u = this.material.uniforms;
    u.uTimeOn.value = day === null ? 0 : 1;
    u.uPlayhead.value = day ?? 0;
    u.uGlowDays.value = glowDays;
  }

  get timeUniforms(): { on: number; playhead: number; glowDays: number } {
    const u = this.material.uniforms;
    return { on: u.uTimeOn.value as number, playhead: u.uPlayhead.value as number, glowDays: u.uGlowDays.value as number }; // prettier-ignore
  }

  /** rgb per point (0..1, sRGB), as last set by setColors / setCategoryColors. */
  get colors(): Float32Array {
    return (this.geometry.getAttribute('aColor') as THREE.BufferAttribute).array as Float32Array;
  }

  /** 0 = surface, 1 = true depth (eased X-ray mix). Keeps CPU positions in step for picking. */
  setDepthMix(mix: number): void {
    this.material.uniforms.uDepthMix.value = mix;
    if (this.surfacePositions === this.depthPositions || mix === this.depthMix) return;
    this.depthMix = mix;
    const s = this.surfacePositions;
    const d = this.depthPositions;
    const out = this.positions;
    for (let i = 0; i < out.length; i++) out[i] = s[i] + (d[i] - s[i]) * mix;
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
