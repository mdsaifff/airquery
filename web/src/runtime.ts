// Wires the imperative parts together (tracking, scene, data, voice, agent).
// React only mounts the DOM elements and the HUD; it never sees per-frame data.
import { config } from './config.ts';
import type { QuerySpec } from './contracts/contracts.ts';
import { askAgent, compileSpec } from './data/agentClient.ts';
import { Db } from './data/db.ts';
import type { SessionDeps } from './data/querySession.ts';
import { Datasets } from './datasets.ts';
import { explainHere } from './explainHere.ts';
import { CursorView, MODE_COLORS } from './hud/cursor.ts';
import { Hover } from './hud/hover.ts';
import { exportMetrics, metrics } from './hud/metrics.ts';
import { hudStore, toast } from './hud/store.ts';
import { CameraController, orbitPosition } from './interaction/cameraController.ts';
import { HandPipeline } from './interaction/handPipeline.ts';
import { attachMouse } from './interaction/mouseInput.ts';
import type { StudyHost } from './interaction/study.ts';
import { applyView } from './scene/applyView.ts';
import { SceneManager } from './scene/sceneManager.ts';
import { downloadJson, LandmarkRecorder } from './tracking/recorder.ts';
import { startTracking } from './tracking/trackingLoop.ts';
import { VoiceController } from './voice/voiceController.ts';
import { WebSpeechToText } from './voice/webSpeech.ts';

/** Scenes in swipe order. */
const DATASETS = ['quakes', 'papers'];
const SCENE_NAMES: Record<string, string> = {
  quakes: 'earthquake globe',
  papers: 'ML paper galaxy',
};

export interface RuntimeElements {
  sceneEl: HTMLElement;
  camCanvas: HTMLCanvasElement;
  /** Owned by the HUD's study panel; the runtime feeds it events and time. */
  study: StudyHost;
}

export interface Runtime {
  dispose(): void;
  /** Mouse baseline: ignore hands and voice; specs come from dropdowns. */
  setBaseline(on: boolean): void;
  applySpec(spec: QuerySpec): void;
  undo(): void;
  resetView(): void;
  /** Typed-input fallback for every voice feature. */
  typed(text: string): void;
}

export function startRuntime(els: RuntimeElements): Runtime {
  let disposed = false;
  const cleanups: (() => void)[] = [];
  /** performance.now() when the last voice/typed request ended; cleared on the next frame. */
  let latencyFrom: number | null = null;

  // --- scene + camera (render loop) ---
  const sm = new SceneManager(els.sceneEl);
  cleanups.push(() => sm.dispose());
  const camera = new CameraController(config, {
    yaw: (150 * Math.PI) / 180, // start over the western Pacific
    pitch: 0.3,
    distance: config.cameraHomeDistance,
  });
  cleanups.push(attachMouse(sm.renderer.domElement, camera));

  // --- datasets: each has its point cloud and its own query history ---
  const sessionDeps = (name: string): SessionDeps => ({
    dataset: name,
    async ask(req) {
      hudStore.thinking = true;
      const t0 = performance.now();
      try {
        const resp = await askAgent(req);
        metrics.agent.push(performance.now() - t0);
        hudStore.timings = resp.timings_ms;
        return resp;
      } finally {
        hudStore.thinking = false;
      }
    },
    compile: compileSpec,
    async run(sql, params) {
      const d = datasets.get(name);
      if (!d) throw new Error('data is still loading');
      const t0 = performance.now();
      const result = await (await db).run(sql, params);
      hudStore.queryMs = performance.now() - t0;
      metrics.query.push(hudStore.queryMs);
      return result;
    },
    show(view, applied, endedAt) {
      const d = datasets.get(name);
      if (!d || datasets.active !== name) return;
      const { shown, legend } = applyView(d.cloud, d.base, d.schema, d.idIndex, d.mask, view);
      Object.assign(hudStore, { shown, legend, glass: applied, total: d.cloud.count });
      latencyFrom = endedAt;
    },
    flyTo: (lat, lon) => camera.flyTo(lat, lon, performance.now()),
    resetView: () => camera.reset(performance.now()),
    notify: toast,
    explain: () => void explainHere({ datasets, hover, camera: sm.camera, db }, name),
  });

  const db = Db.open();
  const datasets = new Datasets(DATASETS, sm.scene, db, sessionDeps);
  cleanups.push(() => datasets.dispose());

  async function showDataset(name: string, announce: boolean): Promise<void> {
    try {
      const d = await datasets.show(name);
      if (disposed) return;
      hudStore.dataset = name;
      if (name === 'quakes') {
        hudStore.placeOptions = d.schema.columns.find((c) => c.name === 'place')?.examples ?? [];
      }
      datasets.session(name).refresh();
      hudStore.status = '';
      if (announce) {
        camera.reset(performance.now());
        toast('info', SCENE_NAMES[name] ?? name);
      }
    } catch (err) {
      if (name === DATASETS[0]) hudStore.status = `Data failed to load: ${String(err)}`;
      else toast('error', `${SCENE_NAMES[name] ?? name} is not built yet (make galaxy).`);
    }
  }
  void showDataset(DATASETS[0], false);
  const switchScene = (dir: 'left' | 'right') => void showDataset(datasets.neighbour(dir), true);

  // --- voice: push-to-talk -> transcript -> utterance ---
  const voice = new VoiceController(
    new WebSpeechToText(),
    {
      transcript(text, final) {
        hudStore.transcript = text;
        hudStore.transcriptFinal = final;
      },
      listening(active) {
        hudStore.listening = active;
      },
      error: (message) => toast('error', message),
    },
    (utterance, endedAt, spoken) => {
      if (spoken) metrics.stt.push(performance.now() - endedAt);
      void datasets.session().submit(utterance, endedAt);
    },
  );

  // --- gestures -> state machine -> camera / cursor / voice ---
  const cursor = new CursorView(els.sceneEl);
  cleanups.push(() => cursor.dispose());
  const hands = new HandPipeline({
    camera,
    rotateGain: config.handRotateGain,
    cursor: (visible, x, y) => cursor.set(visible, x, y),
    listening: (active) => voice.setListening(active),
    undo: () => datasets.session().undo(),
    switchScene,
  });
  const studyHost = els.study;
  hands.listeners.push((e) => studyHost.onEvent(e, performance.now()));
  const hover = new Hover(els.sceneEl, sm.renderer.domElement);
  cleanups.push(() => hover.dispose());
  if (import.meta.env.DEV) {
    // Dev-only handle for headless checks and console poking.
    const handle = { hud: hudStore, hands, camera, voice, datasets, switchScene };
    Object.assign(window, { __airquery: { ...handle, get session() { return datasets.session(); } } }); // prettier-ignore
  }

  sm.onFrame((now, dt) => {
    if (latencyFrom !== null) {
      // First frame after the scene changed: close the voice-to-render clock.
      hudStore.latencyMs = now - latencyFrom;
      metrics.voiceToRender.push(hudStore.latencyMs);
      latencyFrom = null;
    }
    studyHost.tick(now);
    const mode = hands.state.mode;
    cursor.style(mode, hands.hold?.progress ?? 0);
    hudStore.mode = mode;
    const orbit = camera.update(now);
    sm.camera.position.set(...orbitPosition(orbit));
    sm.camera.lookAt(0, 0, 0);
    sm.camera.updateMatrixWorld();
    const d = datasets.current();
    if (d) {
      d.cloud.update(dt, orbit.distance, sm.pixelScale);
      const handCursor = cursor.visible ? cursor.position : null;
      const canPick = mode === 'pointing' || mode === 'idle';
      hover.update(sm.camera, d.cloud, d.base, d.schema, handCursor, canPick);
    }
    hudStore.renderFps = sm.fps;
    hudStore.frameMs = sm.frameMs;
  });
  sm.start();

  // --- hand tracking (its own loop) ---
  const recorder = new LandmarkRecorder();
  cleanups.push(
    startTracking(els.camCanvas, {
      onFrame(frame, fps) {
        if (!hudStore.baseline) hands.onFrame(frame, window.innerWidth, window.innerHeight);
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

  // --- keyboard: space talk, R reset view, Z undo, arrows switch scene, M timings ---
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.repeat) return; // prettier-ignore
    if (e.code === 'Space') {
      e.preventDefault();
      if (hudStore.baseline) return; // no voice in the mouse baseline
      hands.dispatch({ kind: 'talk', active: true }); // push-to-talk while held
    } else if (e.code === 'KeyR' && e.shiftKey && import.meta.env.DEV) {
      recorder.start(performance.now(), config.recordDurationMs); // dev: record a fixture
    } else if (e.code === 'KeyR') {
      camera.reset(performance.now());
    } else if (e.code === 'KeyZ') {
      datasets.session().undo();
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      switchScene(e.code === 'ArrowLeft' ? 'left' : 'right');
    } else if (e.code === 'KeyM') {
      // Frontend timings for eval/latency.py.
      downloadJson(`frontend-timings-${Date.now()}.json`, exportMetrics(navigator.userAgent));
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
    typed: (text) => voice.typed(text),
    setBaseline(on) {
      hudStore.baseline = on;
      if (on) hands.dispatch({ kind: 'handsLost' }); // drop any drag / cursor / listening
    },
    applySpec: (spec) => void datasets.session().applySpec(spec),
    undo: () => datasets.session().undo(),
    resetView: () => camera.reset(performance.now()),
  };
}
