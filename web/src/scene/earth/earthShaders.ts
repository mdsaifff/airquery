// GLSL for the Earth, its clouds and the atmosphere glow. World-space lighting
// from a sun direction uniform; colours are linear and converted on output.

export const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const EARTH_FRAG = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uWater;
  uniform float uHasTex;
  uniform vec3 uSunDir;
  uniform float uSolid;
  uniform float uGlassAlpha;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewW);
    float sunDot = dot(n, uSunDir);
    float day = smoothstep(-0.12, 0.18, sunDot);
    vec3 dayCol = uHasTex > 0.5 ? texture2D(uDay, vUv).rgb : vec3(0.02, 0.06, 0.16);
    vec3 nightCol = uHasTex > 0.5 ? texture2D(uNight, vUv).rgb : vec3(0.0);
    float water = uHasTex > 0.5 ? texture2D(uWater, vUv).r : 0.0;
    vec3 lit = dayCol * (0.06 + 1.1 * max(sunDot, 0.0));
    vec3 lights = nightCol * vec3(1.0, 0.78, 0.5) * 1.8;
    vec3 col = mix(lights + dayCol * 0.04, lit, day);
    vec3 h = normalize(uSunDir + v);
    col += vec3(1.0, 0.92, 0.8) * pow(max(dot(n, h), 0.0), 60.0) * water * day * 0.7;
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    col += vec3(0.25, 0.55, 1.0) * fres * (0.15 + 0.6 * day);
    vec3 glass = vec3(0.12, 0.55, 0.85) * (0.2 + 1.2 * fres);
    gl_FragColor = vec4(mix(glass, col, uSolid), mix(uGlassAlpha + 0.6 * fres, 1.0, uSolid));
    #include <colorspace_fragment>
  }
`;

export const CLOUDS_FRAG = /* glsl */ `
  uniform sampler2D uClouds;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    float c = texture2D(uClouds, vUv).r;
    float light = 0.08 + 0.92 * smoothstep(-0.1, 0.4, dot(normalize(vNormalW), uSunDir));
    gl_FragColor = vec4(vec3(light), c * uOpacity);
    #include <colorspace_fragment>
  }
`;

export const ATMOS_VERT = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const ATMOS_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    // Back faces of a slightly larger shell: brightest just outside the planet's edge.
    float rim = pow(clamp(0.55 - vNormalV.z, 0.0, 1.0), 5.0);
    float edge = smoothstep(-1.0, -0.2, vNormalV.z); // dim the centre (seen through X-ray glass)
    float day = 0.3 + 0.7 * smoothstep(-0.4, 0.5, dot(normalize(vNormalW), uSunDir));
    gl_FragColor = vec4(vec3(0.3, 0.62, 1.0) * rim * edge * day * 1.8, 1.0);
    #include <colorspace_fragment>
  }
`;
