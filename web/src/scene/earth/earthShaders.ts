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
  uniform sampler2D uClouds;
  uniform float uHasTex;
  uniform float uHasClouds;
  uniform float uCloudShift; // cloud layer's drift relative to the crust (uv.x)
  uniform vec3 uSunDir;
  uniform float uSolid;
  uniform float uGlassAlpha;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  const vec3 SKY = vec3(0.28, 0.52, 1.0);
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewW);
    float sunDot = dot(n, uSunDir);
    float nv = max(dot(n, v), 0.0);
    float day = smoothstep(-0.06, 0.22, sunDot);
    vec3 dayCol = uHasTex > 0.5 ? texture2D(uDay, vUv).rgb : vec3(0.01, 0.03, 0.09);
    vec3 nightCol = uHasTex > 0.5 ? texture2D(uNight, vUv).rgb : vec3(0.0);
    float water = uHasTex > 0.5 ? texture2D(uWater, vUv).r : 0.0;
    float cloud = uHasClouds > 0.5 ? texture2D(uClouds, vUv + vec2(uCloudShift, 0.0)).r : 0.0;
    // Shadow: the same clouds, nudged away from the sun.
    float shadow = uHasClouds > 0.5 ? texture2D(uClouds, vUv + vec2(uCloudShift - 0.0025, 0.0015)).r : 0.0;

    // Blue Marble is flat: a little more saturation, and deeper oceans.
    float luma = dot(dayCol, vec3(0.2126, 0.7152, 0.0722));
    dayCol = max(mix(vec3(luma), dayCol, 1.3), 0.0);
    dayCol *= mix(vec3(1.0), vec3(0.45, 0.62, 0.95), water);
    dayCol *= 1.0 - 0.5 * smoothstep(0.2, 0.8, shadow);

    float diffuse = max(sunDot, 0.0);
    vec3 col = dayCol * (0.012 + 1.05 * pow(diffuse, 0.85));
    // Night: sodium-orange city light, softened under cloud.
    // Black Marble has a faint land/sea base under the lights: keep only the lights.
    float li = smoothstep(0.1, 0.9, dot(nightCol, vec3(0.3, 0.59, 0.11)));
    vec3 lights = vec3(1.0, 0.6, 0.28) * li * li * 2.6 * (1.0 - 0.75 * cloud);
    col += lights * (1.0 - day);
    // Ocean sun glint: a tight core plus a broad sheen.
    vec3 h = normalize(uSunDir + v);
    float nh = max(dot(n, h), 0.0);
    col += vec3(1.0, 0.86, 0.66) * (pow(nh, 260.0) * 0.7 + pow(nh, 18.0) * 0.04) * water * day * (1.0 - cloud);
    // Aerial haze: the limb fades into the atmosphere on the lit side.
    float limb = pow(1.0 - nv, 2.2);
    float hazeLit = smoothstep(-0.05, 0.45, sunDot);
    col = mix(col, SKY * 0.85 * hazeLit, limb * 0.7 * hazeLit);

    float fres = pow(1.0 - nv, 3.0);
    vec3 glass = vec3(0.08, 0.4, 0.7) * (0.1 + 0.9 * fres);
    gl_FragColor = vec4(mix(glass, col, uSolid), mix(uGlassAlpha + 0.35 * fres, 1.0, uSolid));
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
    vec3 n = normalize(vNormalW);
    float c = smoothstep(0.1, 1.0, texture2D(uClouds, vUv).r);
    float sd = dot(n, uSunDir);
    float lit = smoothstep(-0.12, 0.3, sd);
    vec3 col = vec3(0.96, 0.97, 1.0) * (0.04 + 0.82 * pow(max(sd, 0.0), 0.8));
    // Thin on the night side so city lights show through; thin at the limb (seen edge-on, they haze).
    float limb = smoothstep(0.0, 0.35, dot(n, normalize(vViewW)));
    gl_FragColor = vec4(col, c * uOpacity * (0.12 + 0.88 * lit) * (0.4 + 0.6 * limb));
    #include <colorspace_fragment>
  }
`;

export const ATMOS_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const ATMOS_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uXray;
  uniform float uEdge; // -dot(n, v) on the shell where the planet's limb is
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    // Back faces of a slightly larger shell: 0 at the shell's outer edge, 1 at the planet's limb.
    vec3 n = normalize(vNormalW);
    float t = clamp(-dot(n, normalize(vViewW)) / uEdge, 0.0, 1.0);
    float glow = pow(t, 3.0) * (1.0 - 0.6 * smoothstep(1.0, 1.6, -dot(n, normalize(vViewW)) / uEdge));
    float sd = dot(n, uSunDir);
    vec3 col = mix(vec3(1.0, 0.4, 0.15), vec3(0.32, 0.6, 1.0), smoothstep(-0.12, 0.3, sd));
    float lit = smoothstep(-0.35, 0.1, sd);
    // In X-ray the shell's far side shows through the glass: keep only a faint rim.
    gl_FragColor = vec4(col * glow * lit * 1.5 * (1.0 - 0.85 * uXray), 1.0);
    #include <colorspace_fragment>
  }
`;
