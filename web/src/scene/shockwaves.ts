// Expanding rings on the strongest visible quakes: one InstancedMesh, animated in the shader.
import * as THREE from 'three';

/** Indices of visible points with value >= minValue, strongest first, at most `max`. */
export function strongestVisible(
  values: ArrayLike<number>,
  visible: Uint8Array,
  minValue: number,
  max: number,
): number[] {
  const idx: number[] = [];
  for (let i = 0; i < values.length; i++) if (visible[i] && values[i] >= minValue) idx.push(i);
  idx.sort((a, b) => values[b] - values[a]);
  return idx.slice(0, max);
}

const VERT = /* glsl */ `
  attribute float aPhase;
  attribute vec3 aColor;
  varying vec2 vUv;
  varying float vPhase;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vPhase = aPhase;
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vPhase;
  varying vec3 vColor;
  void main() {
    float t = fract(uTime + vPhase);
    float d = length(vUv - 0.5) * 2.0;
    // A thin bright front with a soft wake behind it, fading as it spreads.
    float front = smoothstep(0.035, 0.0, abs(d - t));
    float wake = smoothstep(0.0, 0.25, t - d) * step(d, t) * 0.12;
    float ring = (front + wake) * pow(1.0 - t, 1.6);
    if (ring < 0.01) discard;
    vec3 c = pow(vColor, vec3(2.2)) * 1.6 + vec3(0.12);
    gl_FragColor = vec4(c, ring * uOpacity * 0.8);
    #include <colorspace_fragment>
  }
`;

const RING_RADIUS = 1.012; // just above the markers so curvature doesn't clip the ring

export class Shockwaves {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly phase: THREE.InstancedBufferAttribute;
  private readonly color: THREE.InstancedBufferAttribute;

  constructor(max: number) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.phase = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.color = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    geometry.setAttribute('aPhase', this.phase);
    geometry.setAttribute('aColor', this.color);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
  }

  /** Rings for these point indices: on the surface, facing outward, sized by how far above minValue. */
  set(
    indices: number[],
    surface: Float32Array,
    colors: Float32Array,
    values: ArrayLike<number>,
    minValue: number,
  ): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const z = new THREE.Vector3(0, 0, 1);
    indices.forEach((pi, k) => {
      p.fromArray(surface, pi * 3).normalize();
      q.setFromUnitVectors(z, p);
      const size = 0.08 + (values[pi] - minValue) * 0.06;
      s.set(size, size, 1);
      m.compose(p.multiplyScalar(RING_RADIUS), q, s);
      this.mesh.setMatrixAt(k, m);
      this.phase.setX(k, (k * 0.618) % 1); // golden-ratio stagger
      this.color.setXYZ(k, colors[pi * 3], colors[pi * 3 + 1], colors[pi * 3 + 2]);
    });
    this.mesh.count = indices.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.phase.needsUpdate = true;
    this.color.needsUpdate = true;
  }

  update(nowMs: number, periodMs: number, opacity: number): void {
    this.mesh.material.uniforms.uTime.value = nowMs / periodMs;
    this.mesh.material.uniforms.uOpacity.value = opacity;
    this.mesh.visible = opacity > 0.01 && this.mesh.count > 0;
  }
}
