// Pure geo -> scene conversion (docs/ARCHITECTURE.md "Coordinates").
// Scene units: Earth radius R = 1. lon 0 faces +z, east is +x, north is +y.

export const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;

export function radiusAtDepth(depthKm: number, exaggeration: number): number {
  return 1 - (depthKm / EARTH_RADIUS_KM) * exaggeration;
}

/** Writes x, y, z for (lat, lon in degrees, radius r) into out at offset. */
export function geoToXYZ(
  lat: number,
  lon: number,
  r: number,
  out: Float32Array | number[],
  offset = 0,
): void {
  const cl = Math.cos(lat * RAD);
  out[offset] = r * cl * Math.sin(lon * RAD);
  out[offset + 1] = r * Math.sin(lat * RAD);
  out[offset + 2] = r * cl * Math.cos(lon * RAD);
}
