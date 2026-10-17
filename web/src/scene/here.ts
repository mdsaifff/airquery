// Pure: "here" = the globe point under the pointer. Ray -> lat/lon on the unit globe
// (same axes as geo.ts: lon 0 faces +z, east is +x, north is +y), the box around it,
// and the visible points inside that box.
import type { Pointer } from '../contracts/contracts.ts';

type Vec3 = [number, number, number];
const DEG = 180 / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function rayToLatLon(origin: Vec3, dir: Vec3, radius = 1): Pointer | null {
  const [ox, oy, oz] = origin;
  const len = Math.hypot(...dir) || 1;
  const [dx, dy, dz] = [dir[0] / len, dir[1] / len, dir[2] / len];
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc); // nearer hit
  if (t < 0) return null;
  const [x, y, z] = [ox + t * dx, oy + t * dy, oz + t * dz];
  return { lat: Math.asin(clamp(y / radius, -1, 1)) * DEG, lon: Math.atan2(x, z) * DEG };
}

export function hereBox(
  p: Pointer,
  halfDeg: number,
): { lat: [number, number]; lon: [number, number] } {
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    lat: [r(clamp(p.lat - halfDeg, -90, 90)), r(clamp(p.lat + halfDeg, -90, 90))],
    lon: [r(clamp(p.lon - halfDeg, -180, 180)), r(clamp(p.lon + halfDeg, -180, 180))],
  };
}

export function inBox(
  lats: ArrayLike<number>,
  lons: ArrayLike<number>,
  visible: Uint8Array,
  box: { lat: [number, number]; lon: [number, number] },
): number[] {
  const out: number[] = [];
  for (let i = 0; i < lats.length; i++) {
    if (!visible[i]) continue;
    const [la, lo] = [lats[i], lons[i]];
    if (la >= box.lat[0] && la <= box.lat[1] && lo >= box.lon[0] && lo <= box.lon[1]) out.push(i);
  }
  return out;
}
