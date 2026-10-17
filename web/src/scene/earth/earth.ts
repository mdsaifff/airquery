// Realistic Earth for geo datasets: NASA day/night imagery lit by the real sun,
// ocean glint, drifting clouds and an atmosphere glow. X-ray turns the crust to glass.
import * as THREE from 'three';
import { config } from '../../config.ts';
import { ATMOS_FRAG, ATMOS_VERT, CLOUDS_FRAG, EARTH_FRAG, EARTH_VERT } from './earthShaders.ts';
import { graticuleLines } from './graticule.ts';

/** three's sphere starts its texture seam at -x; this puts lon -180 at -z like geoToXYZ. */
export const EARTH_ROTATION_Y = -Math.PI / 2;
const ATMOS_RADIUS = 1.035;

export interface Earth {
  readonly group: THREE.Group;
  /** 0 = solid crust, 1 = X-ray glass (pass the eased mix). */
  setXray(mix: number): void;
  /** Per frame: unit sun direction (scene coords) and frame time (ms). */
  update(sunDir: THREE.Vector3, dtMs: number): void;
}

interface Textures {
  day: THREE.Texture;
  night: THREE.Texture;
  water: THREE.Texture;
  clouds: THREE.Texture | null;
}

let textures: Promise<Textures | null> | null = null;

/** Loaded once, shared by every globe; resolves null if anything is missing. */
function loadTextures(quality: 'high' | 'low'): Promise<Textures | null> {
  textures ??= (async () => {
    const loader = new THREE.TextureLoader();
    const load = async (file: string, srgb: boolean) => {
      const t = await loader.loadAsync(new URL(`textures/${file}`, document.baseURI).href);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 4;
      t.wrapS = THREE.RepeatWrapping; // no seam at the 180° meridian
      return t;
    };
    const k = quality === 'high' ? '' : '_1k';
    const [day, night, water, clouds] = await Promise.all([
      load(`earth_day${k}.jpg`, true),
      load(`earth_night${k}.jpg`, true),
      load('earth_water.png', false),
      quality === 'high' ? load('earth_clouds.jpg', false) : Promise.resolve(null),
    ]);
    return { day, night, water, clouds };
  })().catch((err: unknown) => {
    console.warn('Earth textures unavailable; using a plain globe.', err);
    return null;
  });
  return textures;
}

/** Resolves once the globe textures loaded (or failed: the plain globe is used). */
export function texturesReady(): Promise<unknown> {
  return loadTextures(config.quality);
}

export function createEarth(quality: 'high' | 'low' = config.quality): Earth {
  const sun = { value: new THREE.Vector3(0, 0, 1) };
  const fade = { value: new THREE.Vector2(...config.cloudFadeDistance) };
  const earthMat = new THREE.ShaderMaterial({
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG,
    uniforms: {
      uDay: { value: null },
      uNight: { value: null },
      uWater: { value: null },
      uClouds: { value: null },
      uHasTex: { value: 0 },
      uHasClouds: { value: 0 },
      uCloudShift: { value: 0 },
      uFade: fade,
      uSunDir: sun,
      uSolid: { value: 1 },
      uGlassAlpha: { value: config.xrayCrustOpacity },
    },
  });
  const crust = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat);
  crust.rotation.y = EARTH_ROTATION_Y;
  crust.renderOrder = -2;

  const cloudMat = new THREE.ShaderMaterial({
    vertexShader: EARTH_VERT,
    fragmentShader: CLOUDS_FRAG,
    uniforms: { uClouds: { value: null }, uSunDir: sun, uOpacity: { value: config.cloudOpacity }, uFade: fade }, // prettier-ignore
    transparent: true,
    depthWrite: false,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 96, 64), cloudMat);
  clouds.rotation.y = EARTH_ROTATION_Y;
  clouds.renderOrder = -1;
  clouds.visible = false; // until the cloud texture arrives

  const atmosXray = { value: 0 };
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(ATMOS_RADIUS, 96, 64),
    new THREE.ShaderMaterial({
      vertexShader: ATMOS_VERT,
      fragmentShader: ATMOS_FRAG,
      uniforms: { uSunDir: sun, uXray: atmosXray, uEdge: { value: Math.sqrt(1 - 1 / ATMOS_RADIUS ** 2) } }, // prettier-ignore
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  atmosphere.renderOrder = 3;

  const gridMat = new THREE.LineBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0, depthWrite: false }); // prettier-ignore
  const grid = new THREE.LineSegments(graticuleLines(1.001), gridMat);
  grid.renderOrder = 2;
  grid.visible = false;

  const group = new THREE.Group();
  group.add(crust, clouds, atmosphere, grid);

  void loadTextures(quality).then((t) => {
    if (!t) return;
    earthMat.uniforms.uDay.value = t.day;
    earthMat.uniforms.uNight.value = t.night;
    earthMat.uniforms.uWater.value = t.water;
    earthMat.uniforms.uHasTex.value = 1;
    if (t.clouds) {
      cloudMat.uniforms.uClouds.value = t.clouds;
      earthMat.uniforms.uClouds.value = t.clouds; // their shadows
      earthMat.uniforms.uHasClouds.value = 1;
      clouds.visible = true;
    }
  });

  return {
    group,
    setXray(mix) {
      const glass = mix > 0.001;
      earthMat.uniforms.uSolid.value = 1 - mix;
      earthMat.transparent = glass; // glass: blended, drawn before the points
      earthMat.depthWrite = mix < 0.5; // keep hiding the far side until the crust is mostly glass
      cloudMat.uniforms.uOpacity.value = config.cloudOpacity * (1 - mix);
      earthMat.uniforms.uHasClouds.value = clouds.visible && mix < 0.5 ? 1 : 0;
      atmosXray.value = mix;
      gridMat.opacity = 0.35 * mix;
      grid.visible = glass;
    },
    update(sunDir, dtMs) {
      sun.value.copy(sunDir);
      clouds.rotation.y += (config.cloudSpinRadPerSec * dtMs) / 1000;
      earthMat.uniforms.uCloudShift.value = -(clouds.rotation.y - crust.rotation.y) / (2 * Math.PI);
    },
  };
}
