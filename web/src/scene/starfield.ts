// Background sky: faint stars everywhere, a few bright ones, and a dim Milky Way
// band. Seeded so it never changes; three Points objects, no textures.
import * as THREE from 'three';

const R = 60;
// Galactic plane: tilted so the band crosses the view diagonally.
const BAND = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.05, 0, 0.45));

function stars(
  count: number,
  size: number,
  rand: () => number,
  band: number,
  gain: number,
): THREE.Points {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const phi = rand() * Math.PI * 2;
    // band > 0 squeezes latitude toward the plane (a rough Gaussian from 3 uniforms).
    const u = band > 0 ? ((rand() + rand() + rand()) / 1.5 - 1) * band : rand() * 2 - 1;
    const r = Math.sqrt(1 - u * u) * R;
    p.set(r * Math.cos(phi), u * R, r * Math.sin(phi));
    if (band > 0) p.applyQuaternion(BAND);
    p.toArray(pos, i * 3);
    // Most stars are faint; colour runs from blue-white to orange.
    const b = gain * (0.15 + 0.85 * rand() ** 4);
    const temp = rand();
    col.set([b * (0.8 + 0.25 * temp), b * (0.86 + 0.06 * temp), b * (1.05 - 0.35 * temp)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(
    g,
    new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }), // prettier-ignore
  );
  pts.renderOrder = -3;
  pts.frustumCulled = false;
  return pts;
}

export function createStarfield(seed = 7): THREE.Group {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const sky = new THREE.Group();
  sky.add(
    stars(5000, 1.1, rand, 0, 0.9), // background
    stars(9000, 1.0, rand, 0.16, 0.42), // Milky Way: many dim stars in a band
    stars(260, 2.2, rand, 0, 1.0), // a few bright ones
  );
  return sky;
}
