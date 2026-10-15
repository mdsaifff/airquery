// Pure: where the sun is overhead, and the direction to it in scene coordinates.
// Low-precision solar position (about 1 degree), plenty for a day/night line.
import { geoToXYZ } from './geo.ts';

const RAD = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const d = (date.getTime() - J2000_MS) / 86_400_000; // days since J2000
  const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude (deg)
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD; // obliquity
  const decl = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmstHours = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const lon = ((((ra / RAD - gmstHours * 15 + 180) % 360) + 360) % 360) - 180;
  return { lat: decl / RAD, lon };
}

export function sunDirection(date: Date): [number, number, number] {
  const p = subsolarPoint(date);
  const out: [number, number, number] = [0, 0, 0];
  geoToXYZ(p.lat, p.lon, 1, out);
  return out;
}
