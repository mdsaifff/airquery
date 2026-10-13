// Wires the imperative parts together (tracking, scene, data). React only
// mounts the DOM elements and the HUD; it never sees per-frame data.
import { config } from './config.ts';
import { maskFromResult } from './data/resultMask.ts';
import { CursorView, MODE_COLORS } from './hud/cursor.ts';
import { Hover } from './hud/hover.ts';
import { hudStore } from './hud/store.ts';
import { CameraController, orbitPosition } from './interaction/cameraController.ts';
import { HandPipeline } from './interaction/handPipeline.ts';
import { attachMouse } from './interaction/mouseInput.ts';
import { loadGlobe } from './scene/loadGlobe.ts';
import type { LoadedGlobe } from './scene/loadGlobe.ts';
import { SceneManager } from './scene/sceneManager.ts';
import { downloadJson, LandmarkRecorder } from './tracking/recorder.ts';
import { startTracking } from './tracking/trackingLoop.ts';

export interface RuntimeElements {
  sceneEl: HTMLElement;
  camCanvas: HTMLCanvasElement;
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
  const hover = new Hover(els.sceneEl, sm.renderer.domElement);
  cleanups.push(() => hover.dispose());

  let data: LoadedGlobe | null = null;
  sm.onFrame((now, dt) => {
    const mode = hands.state.mode;
    cursor.style(mode, hands.hold?.progress ?? 0);
    hudStore.mode = mode;
    const orbit = camera.update(now);
    sm.camera.position.set(...orbitPosition(orbit));
    sm.camera.lookAt(0, 0, 0);
    sm.camera.updateMatrixWorld();
    if (data) {
      data.globe.update(dt, orbit.distance, sm.pixelScale);
      const handCursor = cursor.visible ? cursor.position : null;
      const canPick = mode === 'pointing' || mode === 'idle';
      hover.update(sm.camera, data.globe, data.base, handCursor, canPick);
    }
    hudStore.renderFps = sm.fps;
    hudStore.frameMs = sm.frameMs;
  });
  sm.start();

  // --- data ---
  let mask = new Uint8Array(0);
  void loadGlobe(sm.scene)
    .then((loaded) => {
      if (disposed) {
        loaded.globe.dispose();
        return void loaded.db.close();
      }
      data = loaded;
      mask = new Uint8Array(loaded.globe.count);
      hudStore.shown = hudStore.total = loaded.globe.count;
      hudStore.status = '';
      cleanups.push(() => {
        loaded.globe.dispose();
        void loaded.db.close();
      });
    })
    .catch((err: unknown) => {
      hudStore.status = `Data failed to load: ${String(err)}`;
    });

  // --- hand tracking (its own loop) ---
  const recorder = new LandmarkRecorder();
  cleanups.push(
    startTracking(els.camCanvas, {
      onFrame(frame, fps) {
        hands.onFrame(frame, window.innerWidth, window.innerHeight);
        hudStore.trackingFps = fps;
        const fixture = recorder.push(frame, 'recording');
        if (fixture) downloadJson(`fixture-${Date.now()}.json`, fixture);
      },
      skeletonColor: () => (recorder.recording ? '#ffffff' : MODE_COLORS[hands.state.mode]),
      onError(message) {
        hudStore.cameraError = message;
      },
    }),
  );

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
      if (!data) return;
      const { globe, db, idIndex } = data;
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
