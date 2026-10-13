// Earthquake globe: a faint sphere, coastlines, and every quake as one THREE.Points
// with a single BufferGeometry. Queries change per-point alpha/colour/size in
// place; points are never added or removed.
import * as THREE from 'three';
import { config } from '../config.ts';
import { rampColor } from './colorRamp.ts';
import { geoToXYZ, radiusAtDepth } from './geo.ts';
import { createPointsMaterial } from './pointsMaterial.ts';

export interface GlobeData {
  lat: Float64Array;
  lon: Float64Array;
  depthKm: Float64Array;
}

/** [lon, lat, lon, lat, ...] polylines in degrees. */
export type Polylines = number[][];

export class GlobeScene {
  readonly count: number;
  /** World positions, xyz per point (shared with picking). */
  readonly positions: Float32Array;
  /** Target visibility per point: 1 shown, 0 hidden. */
  readonly visible: Uint8Array;
  private readonly group = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly alpha: Float32Array;
  private animating = false;

  constructor(scene: THREE.Scene, data: GlobeData, coastlines: Polylines | null) {
    this.count = data.lat.length;
    this.positions = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      const r = radiusAtDepth(data.depthKm[i], config.depthExaggeration);
      geoToXYZ(data.lat[i], data.lon[i], r, this.positions, i * 3);
    }
    this.visible = new Uint8Array(this.count).fill(1);
    this.alpha = new Float32Array(this.count).fill(1);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute(
      'aColor',
      new THREE.BufferAttribute(new Float32Array(this.count * 3), 3),
    );
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(this.count), 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.material = createPointsMaterial(config.farSideDim);
    const points = new THREE.Points(this.geometry, this.material);
    points.renderOrder = 0;
    points.frustumCulled = false;

    // Faint fill drawn first; an invisible depth-only sphere after the points
    // hides far-side lines without hiding the (sub-surface) points.
    const fill = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshBasicMaterial({
        color: 0x0b1424,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    fill.renderOrder = -1;
    const occluder = new THREE.Mesh(
      new THREE.SphereGeometry(0.998, 64, 32),
      new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true }),
    );
    occluder.renderOrder = 1;
    const lines = new THREE.LineSegments(
      linesGeometry([...graticule(), ...(coastlines ?? [])]),
      new THREE.LineBasicMaterial({ color: 0x5b6b8c, transparent: true, opacity: 0.55 }),
    );
    lines.renderOrder = 2;
    this.group.add(fill, points, occluder, lines);
    scene.add(this.group);
  }

  /** Colour each point by value, mapped through the ramp over [min, max]. */
  setColors(values: ArrayLike<number>, min: number, max: number): void {
    const attr = this.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const out = attr.array as Float32Array;
    const span = max - min || 1;
    for (let i = 0; i < this.count; i++) rampColor((values[i] - min) / span, out, i * 3);
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

function graticule(): Polylines {
  const lines: Polylines = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    const l: number[] = [];
    for (let lon = -180; lon <= 180; lon += 5) l.push(lon, lat);
    lines.push(l);
  }
  for (let lon = -180; lon < 180; lon += 30) {
    const l: number[] = [];
    for (let lat = -90; lat <= 90; lat += 5) l.push(lon, lat);
    lines.push(l);
  }
  return lines;
}

function linesGeometry(polylines: Polylines): THREE.BufferGeometry {
  const segs = polylines.reduce((n, l) => n + Math.max(0, l.length / 2 - 1), 0);
  const pos = new Float32Array(segs * 6);
  let o = 0;
  for (const l of polylines) {
    for (let i = 0; i + 3 < l.length; i += 2) {
      geoToXYZ(l[i + 1], l[i], 1.001, pos, o);
      geoToXYZ(l[i + 3], l[i + 2], 1.001, pos, o + 3);
      o += 6;
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
