// Pure orbit camera around the globe. Mouse and hand gestures both drive it.
// Orbit angles: yaw = longitude the camera sits over, pitch = latitude (radians).

export interface Orbit {
  yaw: number;
  pitch: number;
  distance: number;
}

export interface CameraOptions {
  /** Rotation per dragged pixel at the default distance (rad/px). */
  rotateRadPerPx: number;
  /** Half-life of the release spin (ms). */
  dampingHalfLifeMs: number;
  /** Zoom limits (scene units, Earth radius = 1). */
  distanceMin: number;
  distanceMax: number;
  /** Max |pitch| (rad). */
  pitchLimit: number;
  /** Idle spin speed (rad/s) and the idle time before it starts (ms). */
  autoSpinRadPerSec: number;
  autoSpinIdleMs: number;
  /** Duration of reset / fly-to animations (ms). */
  animMs: number;
  /** Distance a fly-to ends at, unless already closer (scene units). */
  flyToDistance: number;
}

interface Anim {
  from: Orbit;
  to: Orbit;
  start: number;
  duration: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const RAD = Math.PI / 180;

/** Shortest signed angle from a to b (rad). */
function angleDelta(a: number, b: number): number {
  return ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

export class CameraController {
  orbit: Orbit;
  private readonly home: Orbit;
  private readonly opts: CameraOptions;
  private vel = { yaw: 0, pitch: 0 }; // rad/ms
  private dragging = false;
  private frozen = false;
  private lastMoveAt = 0;
  private lastInputAt = -Infinity;
  /** The idle spin runs only in the home view: moving the camera turns it off until a reset. */
  private spinAllowed = true;
  private anim: Anim | null = null;
  private now = 0;

  constructor(opts: CameraOptions, home: Orbit) {
    this.opts = opts;
    this.home = { ...home };
    this.orbit = { ...home };
  }

  beginDrag(now: number): void {
    this.anim = null;
    this.dragging = true;
    this.spinAllowed = false;
    this.vel = { yaw: 0, pitch: 0 };
    this.lastMoveAt = now;
    this.lastInputAt = now;
  }

  /** Drag by screen px. Dragging right turns the globe right (surface follows the hand). */
  rotateBy(dx: number, dy: number, now: number): void {
    if (this.frozen) return;
    const k = this.opts.rotateRadPerPx * (this.orbit.distance / this.home.distance);
    const dYaw = -dx * k;
    const dPitch = dy * k;
    this.orbit.yaw += dYaw;
    this.orbit.pitch = clamp(
      this.orbit.pitch + dPitch,
      -this.opts.pitchLimit,
      this.opts.pitchLimit,
    );
    const dt = Math.max(1, now - this.lastMoveAt);
    // Smooth the release velocity a little so one jittery last frame doesn't fling it.
    this.vel.yaw = 0.5 * this.vel.yaw + 0.5 * (dYaw / dt);
    this.vel.pitch = 0.5 * this.vel.pitch + 0.5 * (dPitch / dt);
    this.lastMoveAt = now;
    this.lastInputAt = now;
    this.spinAllowed = false;
  }

  /** Release: the spin keeps going and decays (damping). */
  endDrag(now: number): void {
    this.dragging = false;
    if (now - this.lastMoveAt > 100) this.vel = { yaw: 0, pitch: 0 }; // held still before release
    this.lastInputAt = now;
  }

  /** scale > 1 zooms in (hands pulled apart). */
  dollyBy(scale: number, now: number): void {
    if (this.frozen || !(scale > 0)) return;
    this.anim = null;
    this.orbit.distance = clamp(
      this.orbit.distance / scale,
      this.opts.distanceMin,
      this.opts.distanceMax,
    );
    this.lastInputAt = now;
    this.spinAllowed = false;
  }

  /** A hand or mouse is over the scene: hold off the idle spin (it would drift under the pointer). */
  keepStill(now: number): void {
    this.lastInputAt = now;
  }

  /** Stop dragging and any spin, without a release fling. */
  stop(now: number): void {
    this.dragging = false;
    this.vel = { yaw: 0, pitch: 0 };
    this.lastInputAt = now;
  }

  /** Clutch: stop all motion and ignore input until unfrozen. */
  setFrozen(frozen: boolean, now: number): void {
    this.frozen = frozen;
    this.dragging = false;
    this.vel = { yaw: 0, pitch: 0 };
    this.lastInputAt = now;
  }

  /** Jump to a shared view (clamped). A shared view holds still: no idle spin. */
  setOrbit(o: Orbit, now: number): void {
    this.anim = null;
    this.dragging = false;
    this.vel = { yaw: 0, pitch: 0 };
    this.spinAllowed = false;
    this.lastInputAt = now;
    this.orbit = {
      yaw: o.yaw,
      pitch: clamp(o.pitch, -this.opts.pitchLimit, this.opts.pitchLimit),
      distance: clamp(o.distance, this.opts.distanceMin, this.opts.distanceMax),
    };
  }

  /** Glide home; the intro passes a longer duration (ms). */
  reset(now: number, durationMs = this.opts.animMs): void {
    this.spinAllowed = true;
    this.animateTo({ ...this.home }, now, durationMs);
  }

  flyTo(lat: number, lon: number, now: number): void {
    this.spinAllowed = false;
    this.animateTo(
      {
        yaw: lon * RAD,
        pitch: clamp(lat * RAD, -this.opts.pitchLimit, this.opts.pitchLimit),
        distance: Math.min(this.orbit.distance, this.opts.flyToDistance),
      },
      now,
      this.opts.animMs,
    );
  }

  get animating(): boolean {
    return this.anim !== null;
  }

  /** Advance time. Call once per render frame. */
  update(now: number): Orbit {
    const dt = this.now === 0 ? 0 : now - this.now;
    this.now = now;
    if (this.anim) {
      const t = clamp((now - this.anim.start) / this.anim.duration, 0, 1);
      const { from, to } = this.anim;
      const e = ease(t);
      this.orbit.yaw = from.yaw + angleDelta(from.yaw, to.yaw) * e;
      this.orbit.pitch = from.pitch + (to.pitch - from.pitch) * e;
      this.orbit.distance = from.distance + (to.distance - from.distance) * e;
      if (t >= 1) {
        this.anim = null;
        this.lastInputAt = now;
      }
    } else if (!this.dragging && !this.frozen) {
      this.orbit.yaw += this.vel.yaw * dt;
      this.orbit.pitch = clamp(
        this.orbit.pitch + this.vel.pitch * dt,
        -this.opts.pitchLimit,
        this.opts.pitchLimit,
      );
      const decay = 0.5 ** (dt / this.opts.dampingHalfLifeMs);
      this.vel.yaw *= decay;
      this.vel.pitch *= decay;
      if (this.spinAllowed && now - this.lastInputAt > this.opts.autoSpinIdleMs) {
        this.orbit.yaw += (this.opts.autoSpinRadPerSec * dt) / 1000;
      }
    }
    return this.orbit;
  }

  private animateTo(to: Orbit, now: number, duration: number): void {
    this.dragging = false;
    this.vel = { yaw: 0, pitch: 0 };
    this.anim = { from: { ...this.orbit }, to, start: now, duration };
    this.lastInputAt = now;
  }
}

/** Camera position for an orbit (same convention as scene/geo.ts). */
export function orbitPosition(o: Orbit): [number, number, number] {
  const cp = Math.cos(o.pitch);
  return [
    o.distance * cp * Math.sin(o.yaw),
    o.distance * Math.sin(o.pitch),
    o.distance * cp * Math.cos(o.yaw),
  ];
}
