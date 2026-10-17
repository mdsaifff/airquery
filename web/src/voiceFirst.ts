// Voice first: "here" (the globe point under the hand or mouse when listening starts,
// marked with a pin), the box of points around it, and the globe's spoken replies.
import * as THREE from 'three';
import { config } from './config.ts';
import type { Pointer } from './contracts/contracts.ts';
import type { LoadedDataset } from './scene/loadDataset.ts';
import { geoToXYZ } from './scene/geo.ts';
import { hereBox, inBox, rayToLatLon } from './scene/here.ts';
import type { Replier } from './voice/reply.ts';

export interface VoiceFirstHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  replier: Replier;
}

export class VoiceFirst {
  private readonly host: VoiceFirstHost;
  private readonly ray = new THREE.Raycaster();
  private readonly pinMesh: THREE.Mesh;
  private pin: Pointer | null = null;
  private pinUntil = Infinity;

  constructor(host: VoiceFirstHost) {
    this.host = host;
    this.pinMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfdb42f }),
    );
    this.pinMesh.visible = false;
    host.scene.add(this.pinMesh);
  }

  private pick(screen: { x: number; y: number } | null, geo: boolean): Pointer | null {
    if (!screen || !geo) return null;
    const ndc = new THREE.Vector2(
      (screen.x / innerWidth) * 2 - 1,
      -(screen.y / innerHeight) * 2 + 1,
    );
    this.ray.setFromCamera(ndc, this.host.camera);
    const { origin: o, direction: d } = this.ray.ray;
    return rayToLatLon([o.x, o.y, o.z], [d.x, d.y, d.z]);
  }

  /** Listening started: remember the spot under the pointer and pin it. */
  captureHere(screen: { x: number; y: number } | null, geo: boolean): void {
    this.pin = this.pick(screen, geo);
    this.pinUntil = Infinity;
    this.pinMesh.visible = this.pin !== null;
    if (this.pin) {
      const at: number[] = [];
      geoToXYZ(this.pin.lat, this.pin.lon, 1.006, at);
      this.pinMesh.position.set(at[0], at[1], at[2]);
    }
  }

  /** "here" for a request: the pinned spot, or (typed commands) the pointer right now. */
  pointer(screenNow: { x: number; y: number } | null, geo: boolean): Pointer | null {
    return this.pin ?? this.pick(screenNow, geo);
  }

  /** Listening ended: the pin fades a few seconds later. */
  releaseAt(now: number): void {
    this.pinUntil = now + config.pinShowMs;
  }

  update(now: number): void {
    if (this.pin && now > this.pinUntil) {
      this.pin = null;
      this.pinMesh.visible = false;
    }
  }

  /** Visible points in the box around the pin ("what happened here?"), or null. */
  hereSelection(d: LoadedDataset): number[] | null {
    const pos = d.schema.position;
    if (!this.pin || pos.kind !== 'geo') return null;
    const lats = d.base.numbers.get(pos.lat);
    const lons = d.base.numbers.get(pos.lon);
    if (!lats || !lons) return null;
    return inBox(lats, lons, d.cloud.visible, hereBox(this.pin, config.hereHalfDeg));
  }

  say(text: string): void {
    this.host.replier.say(text, performance.now());
  }
}
