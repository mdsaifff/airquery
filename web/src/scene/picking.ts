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
    const behind = Math.hypot(x - cx, y - cy, z - cz) > p.camDist;
    const score = d2 + (behind ? r2 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
