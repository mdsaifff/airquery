// Round, screen-sized points with per-point colour, size and alpha. Points on
// the far side of the globe are dimmed so the near side reads first.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  uniform float uPixelScale;
  uniform float uCamDist;
  uniform float uFarDim;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(64.0, aSize * uPixelScale / -mv.z);
    float far = clamp(-mv.z - uCamDist + 0.5, 0.0, 1.0);
    vColor = aColor;
    vAlpha = aAlpha * (1.0 - uFarDim * far);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.01) discard;
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.3, d));
  }
`;

export function createPointsMaterial(farDim: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uPixelScale: { value: 1000 },
      uCamDist: { value: 3 },
      uFarDim: { value: farDim },
    },
    transparent: true,
    depthWrite: false,
  });
}
