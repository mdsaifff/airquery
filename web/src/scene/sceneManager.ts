// Renderer, camera, resize and the render loop. The loop only reads state that
// other loops (tracking, DuckDB) have already written; it never awaits them.
import * as THREE from 'three';
import { config } from '../config.ts';
import { metrics } from '../hud/metrics.ts';

export type FrameCallback = (now: number, dt: number) => void;

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Rendered frames in the last full second. */
  fps = 0;
  /** CPU time of the last frame's callbacks + render, smoothed (ms). */
  frameMs = 0;
  private readonly callbacks: FrameCallback[] = [];
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private last = 0;
  private frames = 0;
  private fpsWindowStart = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x05070d);
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(config.cameraFovDeg, 1, 0.01, 100);
    this.resizeObserver = new ResizeObserver(() => this.resize(container));
    this.resizeObserver.observe(container);
    this.resize(container);
  }

  onFrame(cb: FrameCallback): void {
    this.callbacks.push(cb);
  }

  start(): void {
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const t0 = performance.now();
      const dt = this.last ? now - this.last : 0;
      this.last = now;
      for (const cb of this.callbacks) cb(now, dt);
      this.renderer.render(this.scene, this.camera);
      const ms = performance.now() - t0;
      metrics.frame.push(ms);
      this.frameMs = 0.9 * this.frameMs + 0.1 * ms;
      this.frames++;
      if (now - this.fpsWindowStart >= 1000) {
        this.fps = (this.frames * 1000) / (now - this.fpsWindowStart);
        this.frames = 0;
        this.fpsWindowStart = now;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Pixels per scene unit at view distance 1, for screen-sized points. */
  get pixelScale(): number {
    const h = this.renderer.domElement.height;
    return h / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(container: HTMLElement): void {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
