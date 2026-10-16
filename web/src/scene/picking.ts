// Pure screen-space picking: the visible point nearest the cursor, within a radius.
// Points behind the globe's centre plane lose to points in front.

export interface PickInput {
  /** xyz per point (world). */
  positions: Float32Array;
  /** 1 = pickable. */
  visible: Uint8Array;
  /** Column-major view-projection matrix (THREE.Matrix4.elements). */
  viewProj: ArrayLike<number>;
  /** Camera distance from the globe centre (scene units). */
  camDist: number;
  /** Camera position (world), to tell front from back. */
  camPos: [number, number, number];
  width: number;
  height: number;
  x: number;
  y: number;
  radiusPx: number;
  /** A solid globe hides the far side: points facing away from the camera can't be picked. */
  occluded?: boolean;
}

/** On a solid unit globe, a point is visible when it faces the camera (p·cam > |p|²). */
function facesCamera(x: number, y: number, z: number, cam: [number, number, number]): boolean {
  return x * cam[0] + y * cam[1] + z * cam[2] > x * x + y * y + z * z;
}

export function pickNearest(p: PickInput): number {
  const m = p.viewProj;
  const r2 = p.radiusPx * p.radiusPx;
  const [cx, cy, cz] = p.camPos;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < p.visible.length; i++) {
    if (!p.visible[i]) continue;
    const x = p.positions[i * 3];
    const y = p.positions[i * 3 + 1];
    const z = p.positions[i * 3 + 2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0) continue;
    const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) * 0.5 * p.width;
    const sy = (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5 * p.height;
    const d2 = (sx - p.x) ** 2 + (sy - p.y) ** 2;
    if (d2 > r2) continue;
    if (p.occluded && !facesCamera(x, y, z, p.camPos)) continue;
    const behind = Math.hypot(x - cx, y - cy, z - cz) > p.camDist;
    const score = d2 + (behind ? r2 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Every visible point within radiusPx of (x, y), skipping the far side of the globe. */
export function pointsWithin(p: PickInput, skipBehind: boolean): number[] {
  const m = p.viewProj;
  const r2 = p.radiusPx * p.radiusPx;
  const [cx, cy, cz] = p.camPos;
  const out: number[] = [];
  for (let i = 0; i < p.visible.length; i++) {
    if (!p.visible[i]) continue;
    const x = p.positions[i * 3];
    const y = p.positions[i * 3 + 1];
    const z = p.positions[i * 3 + 2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0) continue;
    const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) * 0.5 * p.width;
    const sy = (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5 * p.height;
    if ((sx - p.x) ** 2 + (sy - p.y) ** 2 > r2) continue;
    if (skipBehind && Math.hypot(x - cx, y - cy, z - cz) > p.camDist) continue;
    if (p.occluded && !facesCamera(x, y, z, p.camPos)) continue;
    out.push(i);
  }
  return out;
}

/** Even-odd rule; poly is a closed loop of screen points (px). */
export function pointInPolygon(
  x: number,
  y: number,
  poly: readonly { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Visible points whose screen position falls inside the lasso polygon. */
export function pointsInPolygon(
  p: Omit<PickInput, 'x' | 'y' | 'radiusPx'>,
  poly: readonly { x: number; y: number }[],
  skipBehind: boolean,
): number[] {
  const m = p.viewProj;
  const [cx, cy, cz] = p.camPos;
  const out: number[] = [];
  for (let i = 0; i < p.visible.length; i++) {
    if (!p.visible[i]) continue;
    const x = p.positions[i * 3];
    const y = p.positions[i * 3 + 1];
    const z = p.positions[i * 3 + 2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0) continue;
    if (skipBehind && Math.hypot(x - cx, y - cy, z - cz) > p.camDist) continue;
    if (p.occluded && !facesCamera(x, y, z, p.camPos)) continue;
    const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) * 0.5 * p.width;
    const sy = (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5 * p.height;
    if (pointInPolygon(sx, sy, poly)) out.push(i);
  }
  return out;
}
