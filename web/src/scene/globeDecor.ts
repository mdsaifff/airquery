// The globe around geo datasets: a faint sphere, graticule and coastlines.
import * as THREE from 'three';
import { geoToXYZ } from './geo.ts';

/** [lon, lat, lon, lat, ...] polylines in degrees. */
export type Polylines = number[][];

let coastlines: Promise<Polylines | null> | null = null;

/** Natural Earth coastlines, fetched once; null if missing (the globe still works). */
export function loadCoastlines(): Promise<Polylines | null> {
  coastlines ??= fetch(new URL('data/coastlines.json', document.baseURI))
    .then((r) => r.json() as Promise<{ lines: Polylines }>)
    .then((d) => d.lines)
    .catch(() => null);
  return coastlines;
}

export function createGlobeDecor(coastlines: Polylines | null): THREE.Group {
  // Faint fill drawn first; an invisible depth-only sphere after the points
  // hides far-side lines without hiding the (sub-surface) points.
  const fill = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.MeshBasicMaterial({ color: 0x0b1424, transparent: true, opacity: 0.5, depthWrite: false }), // prettier-ignore
  );
  fill.renderOrder = -1;
  const occluder = new THREE.Mesh(
    new THREE.SphereGeometry(0.998, 64, 32),
    new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true }),
  );
  occluder.renderOrder = 1;
  const lines = new THREE.LineSegments(
    linesGeometry([...graticule(), ...(coastlines ?? [])]),
    new THREE.LineBasicMaterial({ color: 0x5b6b8c, transparent: true, opacity: 0.55 }),
  );
  lines.renderOrder = 2;
  const group = new THREE.Group();
  group.add(fill, occluder, lines);
  return group;
}

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

function linesGeometry(polylines: Polylines): THREE.BufferGeometry {
  const segs = polylines.reduce((n, l) => n + Math.max(0, l.length / 2 - 1), 0);
  const pos = new Float32Array(segs * 6);
  let o = 0;
  for (const l of polylines) {
    for (let i = 0; i + 3 < l.length; i += 2) {
      geoToXYZ(l[i + 1], l[i], 1.001, pos, o);
      geoToXYZ(l[i + 3], l[i + 2], 1.001, pos, o + 3);
      o += 6;
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
