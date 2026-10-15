// 3D hover feedback: a pulsing ring around the hovered point, and in X-ray a
// glowing line from the surface straight down to where the quake happened.
import * as THREE from 'three';
import type { PointCloud } from './pointCloud.ts';

const ACCENT = 0x3ee6ff;
const PULSE_MS = 1200;

export class HoverMarker {
  readonly group = new THREE.Group();
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly linePos = new Float32Array(6);

  constructor() {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 48),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), // prettier-ignore
    );
    this.ring.renderOrder = 4;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, depthWrite: false })); // prettier-ignore
    this.line.renderOrder = 4;
    this.group.add(this.ring, this.line);
    this.group.visible = false;
  }

  /** i < 0 (or no cloud) hides it. xray is the eased X-ray mix. */
  update(
    cloud: PointCloud | null,
    i: number,
    xray: number,
    nowMs: number,
    camera: THREE.Camera,
  ): void {
    if (!cloud || i < 0 || !cloud.group.visible) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const p = cloud.positions;
    this.ring.position.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    this.ring.lookAt(camera.position);
    const t = (nowMs % PULSE_MS) / PULSE_MS;
    const dist = camera.position.distanceTo(this.ring.position);
    this.ring.scale.setScalar(dist * (0.012 + 0.014 * t));
    this.ring.material.opacity = 1 - t;
    const hasDepth = cloud.surfacePositions !== cloud.depthPositions;
    this.line.visible = hasDepth && xray > 0.05;
    if (this.line.visible) {
      this.linePos.set(cloud.surfacePositions.subarray(i * 3, i * 3 + 3), 0);
      this.linePos.set(cloud.depthPositions.subarray(i * 3, i * 3 + 3), 3);
      this.line.geometry.getAttribute('position').needsUpdate = true;
      this.line.material.opacity = 0.9 * xray;
    }
  }
}
