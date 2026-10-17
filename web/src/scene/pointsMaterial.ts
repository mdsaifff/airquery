// Glowing round markers with per-point colour, size and alpha. Positions blend
// between the surface and true depth (X-ray); points pop in with a small
// overshoot as their alpha rises. Far-side points are dimmed in X-ray.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  attribute vec3 aSurface;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  uniform float uPixelScale;
  uniform float uCamDist;
  uniform float uFarDim;
  uniform float uDepthMix;
  varying vec3 vColor;
  varying float vAlpha;
  float easeOutBack(float t) {
    float c1 = 1.70158;
    return 1.0 + (c1 + 1.0) * pow(t - 1.0, 3.0) + c1 * pow(t - 1.0, 2.0);
  }
  void main() {
    vec3 p = mix(aSurface, position, uDepthMix);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float pop = easeOutBack(clamp(aAlpha, 0.0, 1.0));
    gl_PointSize = min(72.0, aSize * pop * uPixelScale / -mv.z);
    // Pull the sprite toward the camera by its radius (same screen spot) so the
    // solid crust doesn't clip the half of the dot that faces the globe's centre.
    mv.xyz -= normalize(mv.xyz) * 0.5 * aSize * pop;
    gl_Position = projectionMatrix * mv;
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
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.42, 0.0, d);
    float halo = pow(smoothstep(1.0, 0.0, d), 2.5) * 0.6;
    vec3 c = pow(vColor, vec3(2.2)); // ramp colours are sRGB
    vec3 rgb = c * (halo + core * 1.6) + vec3(core * core * 1.5); // white-hot centre, above the bloom threshold
    gl_FragColor = vec4(rgb, vAlpha * max(core, halo));
    #include <colorspace_fragment>
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
      uDepthMix: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
  });
}
