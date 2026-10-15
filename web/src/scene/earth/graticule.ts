// Latitude/longitude grid lines, shown faintly in X-ray mode for orientation.
import * as THREE from 'three';
import { geoToXYZ } from '../geo.ts';

/** [lon, lat, lon, lat, ...] polylines in degrees. */
type Polylines = number[][];

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

export function graticuleLines(radius: number): THREE.BufferGeometry {
  const polylines = graticule();
  const segs = polylines.reduce((n, l) => n + Math.max(0, l.length / 2 - 1), 0);
  const pos = new Float32Array(segs * 6);
  let o = 0;
  for (const l of polylines) {
    for (let i = 0; i + 3 < l.length; i += 2) {
      geoToXYZ(l[i + 1], l[i], radius, pos, o);
      geoToXYZ(l[i + 3], l[i + 2], radius, pos, o + 3);
      o += 6;
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
