// Wires the imperative parts together (tracking, scene, data). React only
// mounts the DOM elements and the HUD; it never sees per-frame data.
import { config } from './config.ts';
import type { Columns } from './data/arrow.ts';
import { Db } from './data/db.ts';
import { indexIds, maskFromResult } from './data/resultMask.ts';
import { CursorView, MODE_COLORS } from './hud/cursor.ts';
import { hudStore } from './hud/store.ts';
import { CameraController, orbitPosition } from './interaction/cameraController.ts';
import { HandPipeline } from './interaction/handPipeline.ts';
import { attachMouse } from './interaction/mouseInput.ts';
import { GlobeScene } from './scene/globeScene.ts';
import type { Polylines } from './scene/globeScene.ts';
import { SceneManager } from './scene/sceneManager.ts';
import { startCamera } from './tracking/camera.ts';
import { HandTracker } from './tracking/handTracker.ts';
import { downloadJson, LandmarkRecorder } from './tracking/recorder.ts';
import { drawSkeleton } from './tracking/skeletonView.ts';

export interface RuntimeElements {
  sceneEl: HTMLElement;
  camCanvas: HTMLCanvasElement;
}

const BASE_QUERY = 'SELECT * FROM quakes';

function stopVideo(video: HTMLVideoElement | undefined): void {
  const stream = video?.srcObject;
  if (stream instanceof MediaStream) stream.getTracks().forEach((t) => t.stop());
}

function range(values: Float64Array): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

async function fetchCoastlines(): Promise<Polylines | null> {
  try {
    const res = await fetch(new URL('data/coastlines.json', document.baseURI));
    return ((await res.json()) as { lines: Polylines }).lines;
  } catch {
    return null; // the globe still works without them
  }
}

function numbers(cols: Columns, name: string): Float64Array {
  const col = cols.numbers.get(name);
  if (!col) throw new Error(`missing column ${name}`);
  return col;
}

export interface Runtime {
  dispose(): void;
  /** Temporary (T1.5): show only quakes deeper than km, via a DuckDB prepared statement. */
  depthFilter(km: number | null): Promise<void>;
}

export function startRuntime(els: RuntimeElements): Runtime {
  let disposed = false;
  const cleanups: (() => void)[] = [];

  // --- scene + camera (render loop) ---
  const sm = new SceneManager(els.sceneEl);
  cleanups.push(() => sm.dispose());
  const camera = new CameraController(config, {
    yaw: (150 * Math.PI) / 180, // start over the western Pacific
    pitch: 0.3,
    distance: config.cameraHomeDistance,
  });
  cleanups.push(attachMouse(sm.renderer.domElement, camera));

  // --- gestures -> state machine -> camera / cursor / voice ---
  const cursor = new CursorView(els.sceneEl);
  cleanups.push(() => cursor.dispose());
  const hands = new HandPipeline({
    camera,
    rotateGain: config.handRotateGain,
    cursor: (visible, x, y) => cursor.set(visible, x, y),
    listening: (active) => {
      hudStore.listening = active;
    },
    undo: () => {},
  });

  let globe: GlobeScene | null = null;
  sm.onFrame((now, dt) => {
    cursor.style(hands.state.mode, hands.hold?.progress ?? 0);
    hudStore.mode = hands.state.mode;
    const orbit = camera.update(now);
    sm.camera.position.set(...orbitPosition(orbit));
    sm.camera.lookAt(0, 0, 0);
    globe?.update(dt, orbit.distance, sm.pixelScale);
    hudStore.renderFps = sm.fps;
    hudStore.frameMs = sm.frameMs;
  });
  sm.start();

  // --- data ---
  let db: Db | undefined;
  let idIndex = new Map<string, number>();
  let mask = new Uint8Array(0);
  void (async () => {
    try {
      const [opened, coastlines] = await Promise.all([Db.open(['quakes']), fetchCoastlines()]);
      db = opened;
      if (disposed) return void db.close();
      const base = await db.run(BASE_QUERY);
      const depth = numbers(base, 'depth_km');
      const mag = numbers(base, 'magnitude');
      globe = new GlobeScene(
        sm.scene,
        { lat: numbers(base, 'lat'), lon: numbers(base, 'lon'), depthKm: depth },
        coastlines,
      );
      globe.setColors(depth, ...range(depth));
      globe.setSizes(mag, ...range(mag));
      idIndex = indexIds(base.strings.get('id') ?? []);
      mask = new Uint8Array(globe.count);
      hudStore.shown = hudStore.total = globe.count;
      hudStore.status = '';
      cleanups.push(() => globe?.dispose());
    } catch (err) {
      hudStore.status = `Data failed to load: ${String(err)}`;
    }
  })();
  cleanups.push(() => void db?.close());

  // --- hand tracking (its own loop) ---
  const recorder = new LandmarkRecorder();
  let video: HTMLVideoElement | undefined;
  let tracker: HandTracker | undefined;
  void (async () => {
    try {
      video = await startCamera();
      if (disposed) return stopVideo(video);
      tracker = await HandTracker.create();
      if (disposed) return tracker.close();
    } catch (err) {
      hudStore.cameraError = `Camera unavailable (${String(err)}). Mouse mode.`;
      return;
    }
    const ctx = els.camCanvas.getContext('2d');
    const cam = video;
    tracker.start(cam, (frame) => {
      hands.onFrame(frame, window.innerWidth, window.innerHeight);
      const color = recorder.recording ? '#ffffff' : MODE_COLORS[hands.state.mode];
      if (ctx) drawSkeleton(ctx, cam, frame, color);
      hudStore.trackingFps = tracker?.fps ?? 0;
      const fixture = recorder.push(frame, 'recording');
      if (fixture) downloadJson(`fixture-${Date.now()}.json`, fixture);
    });
  })();
  cleanups.push(() => {
    tracker?.close();
    stopVideo(video);
  });

  // --- keyboard fallbacks ---
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.repeat) return;
    if (e.code === 'Space') {
      e.preventDefault();
      hands.dispatch({ kind: 'talk', active: true }); // push-to-talk while held
    } else if (e.code === 'KeyR' && e.shiftKey && import.meta.env.DEV) {
      recorder.start(performance.now(), config.recordDurationMs); // dev: record a fixture
    } else if (e.code === 'KeyR') {
      camera.reset(performance.now());
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
      hands.dispatch({ kind: 'talk', active: false });
    }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  cleanups.push(() => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
  });

  return {
    dispose() {
      disposed = true;
      cleanups.reverse().forEach((fn) => fn());
    },
    async depthFilter(km) {
      if (!db || !globe) return;
      if (km === null) {
        globe.setVisibility(null);
        hudStore.shown = globe.count;
        return;
      }
      const t0 = performance.now();
      const result = await db.run('SELECT id FROM quakes WHERE depth_km > ?', [km]);
      hudStore.queryMs = performance.now() - t0;
      hudStore.shown = maskFromResult(result, 'id', idIndex, mask);
      globe.setVisibility(mask);
    },
  };
}
