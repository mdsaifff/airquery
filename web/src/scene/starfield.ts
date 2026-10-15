// Background stars: one Points object on a large sphere, seeded so it never changes.
import * as THREE from 'three';

export function createStarfield(count = 4000, seed = 7): THREE.Points {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u) * 60;
    pos.set([r * Math.cos(phi), u * 60, r * Math.sin(phi)], i * 3);
    const b = 0.35 + 0.65 * rand() ** 3;
    const warm = rand();
    col.set([b * (0.85 + 0.15 * warm), b * 0.92, b * (1 - 0.15 * warm)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(
    g,
    new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }), // prettier-ignore
  );
  stars.renderOrder = -3;
  stars.frustumCulled = false;
  return stars;
}
