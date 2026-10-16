// Wires the imperative parts together (tracking, scene, data, voice, agent).
// React only mounts the DOM elements and the HUD; it never sees per-frame data.
import * as THREE from 'three';
import { config } from './config.ts';
import type { QuerySpec } from './contracts/contracts.ts';
import { askAgent, compileSpec } from './data/agentClient.ts';
import { Db } from './data/db.ts';
import type { SessionDeps } from './data/querySession.ts';
import { Datasets } from './datasets.ts';
import { explainHere } from './explainHere.ts';
import { LassoSelect } from './lassoSelect.ts';
import { CursorView, MODE_COLORS } from './hud/cursor.ts';
import { Hover } from './hud/hover.ts';
import { exportMetrics, metrics } from './hud/metrics.ts';
import { approach } from './hud/format.ts';
import { hudStore, toast } from './hud/store.ts';
import { CameraController, orbitPosition } from './interaction/cameraController.ts';
import { HandPipeline } from './interaction/handPipeline.ts';
import { attachMouse } from './interaction/mouseInput.ts';
import type { StudyHost } from './interaction/study.ts';
import { applyView } from './scene/applyView.ts';
import { buildCsvDataset, centroid, importCsv } from './scene/loadCsv.ts';
import type { CsvImport } from './scene/loadCsv.ts';
import type { CsvMapping } from './data/csvSchema.ts';
import { SceneManager } from './scene/sceneManager.ts';
import { HoverMarker } from './scene/hoverMarker.ts';
import { IntroPlayer } from './scene/intro.ts';
import { strongestVisible } from './scene/shockwaves.ts';
import { createStarfield } from './scene/starfield.ts';
import { sunDirection } from './scene/sun.ts';
import { wantsXray, XrayState } from './scene/xray.ts';
import { downloadJson, LandmarkRecorder } from './tracking/recorder.ts';
import { captureFrames } from './tracking/captureFrames.ts';
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
  /** Bring your own CSV: load and guess the mapping, then build it once confirmed. */
  importCsv(file: File): Promise<CsvImport>;
  finishCsv(imp: CsvImport, mapping: CsvMapping): Promise<void>;
  /** Custom gesture training data: capture labelled webcam frames to <label>.tar. */
  captureGesture(label: string, onProgress: (done: number) => void): Promise<void>;
  /** X-ray: crust to glass, quakes sink to their real depth (X key, legend button). */
  toggleXray(): void;
  /** Replay the year from the start (top bar button). */
  replayIntro(): void;
}

export function startRuntime(els: RuntimeElements): Runtime {
  let disposed = false;
  const cleanups: (() => void)[] = [];
  /** performance.now() when the last voice/typed request ended; cleared on the next frame. */
  let latencyFrom: number | null = null;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // --- scene + camera (render loop) ---
  const sm = new SceneManager(els.sceneEl);
  cleanups.push(() => sm.dispose());
  sm.scene.add(createStarfield());
  const sunDir = new THREE.Vector3(0, 0, 1);
  let sunAt = -Infinity;
  const xray = new XrayState();
  const hoverMarker = new HoverMarker();
  sm.scene.add(hoverMarker.group);
  let intro: IntroPlayer | null = null;
  let introPlayed = false;
  const startIntro = () => {
    const d = datasets.current();
    if (!d || reduceMotion) return;
    const timeCol = d.schema.columns.find((c) => c.type === 'timestamp')?.name;
    intro = new IntroPlayer(timeCol ? (d.base.numbers.get(timeCol) ?? null) : null, config.introMs);
    const now = performance.now();
    intro.begin(now);
    camera.orbit.distance = config.introStartDistance;
    camera.reset(now, config.introMs);
  };
  const skipIntro = () => intro?.skip();
  const camera = new CameraController(config, {
    yaw: (150 * Math.PI) / 180, // start over the western Pacific
    pitch: 0.3,
    distance: config.cameraHomeDistance,
  });
  cleanups.push(attachMouse(sm.renderer.domElement, camera));
  const onPointerDown = () => skipIntro();
  sm.renderer.domElement.addEventListener('pointerdown', onPointerDown);
  cleanups.push(() => sm.renderer.domElement.removeEventListener('pointerdown', onPointerDown));

  // --- datasets: each has its point cloud and its own query history ---
  const sessionDeps = (name: string): SessionDeps => ({
    dataset: name,
    get datasetSchema() {
      return name.startsWith('user_') ? datasets.get(name)?.schema : undefined;
    },
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
      skipIntro(); // a query (or undo) wins over the replay
      const d = datasets.get(name);
      if (!d || datasets.active !== name) return;
      lasso.selection = null; // a new query replaces any lasso focus
      const { shown, legend } = applyView(d.cloud, d.base, d.schema, d.idIndex, d.mask, view);
      Object.assign(hudStore, { shown, legend, glass: applied, total: d.cloud.count });
      const pos = d.schema.position;
      xray.follow(wantsXray(applied.spec, pos.kind === 'geo' ? (pos.depth ?? null) : null));
      const ringValues = d.schema.default_size_by ? d.base.numbers.get(d.schema.default_size_by) : undefined; // prettier-ignore
      if (d.shockwaves && ringValues) {
        const top = strongestVisible(ringValues, d.cloud.visible, config.shockwaveMinMag, config.shockwaveMax); // prettier-ignore
        d.shockwaves.set(top, d.cloud.surfacePositions, d.cloud.colors, ringValues, config.shockwaveMinMag); // prettier-ignore
      }
      latencyFrom = endedAt;
    },
    flyTo: (lat, lon) => camera.flyTo(lat, lon, performance.now()),
    resetView: () => camera.reset(performance.now()),
    notify: toast,
    explain: () => {
      const ctx = { datasets, hover, camera: sm.camera, db, selection: () => lasso.selection };
      void explainHere(ctx, name);
    },
  });

  const db = Db.open();
  const datasets = new Datasets(DATASETS, sm.scene, db, sessionDeps);
  cleanups.push(() => datasets.dispose());

  async function showDataset(name: string, announce: boolean): Promise<void> {
    try {
      const d = await datasets.show(name);
      if (disposed) return;
      hudStore.dataset = name;
      hudStore.subtitle = d.schema.description;
      const pos = d.schema.position;
      hudStore.geo = pos.kind === 'geo';
      hudStore.depthColumn = pos.kind === 'geo' ? (pos.depth ?? null) : null;
      if (name === 'quakes') {
        hudStore.placeOptions = d.schema.columns.find((c) => c.name === 'place')?.examples ?? [];
      }
      datasets.session(name).refresh();
      if (name === DATASETS[0] && !introPlayed) {
        introPlayed = true;
        startIntro();
      }
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
    lasso: (step, x, y) => lasso.step(step, x, y),
    explain: () => datasets.session().explainNow(),
  });
  const studyHost = els.study;
  hands.listeners.push((e) => studyHost.onEvent(e, performance.now()));
  hands.listeners.push((e) => {
    // A real gesture skips the replay; a hand merely showing up (cursor) or leaving does not.
    if (e.kind !== 'cursor' && e.kind !== 'holdProgress' && e.kind !== 'handsLost') skipIntro();
  });
  const hover = new Hover(els.sceneEl, sm.renderer.domElement);
  cleanups.push(() => hover.dispose());
  const lasso = new LassoSelect(els.sceneEl, datasets, sm.camera);
  cleanups.push(lasso.attachMouse(sm.renderer.domElement), () => lasso.dispose());
  if (import.meta.env.DEV) {
    // Dev-only handle for headless checks and console poking.
    const handle = { hud: hudStore, hands, camera, voice, datasets, switchScene, config };
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
    xray.step(dt, config.xrayAnimMs);
    hudStore.xray = xray.target === 1;
    if (d) {
      if (now - sunAt > 1000) {
        // The day/night line moves slowly: recompute once a second.
        sunAt = now;
        sunDir.set(
          ...sunDirection(config.sunTimeOverride ? new Date(config.sunTimeOverride) : new Date()),
        );
      }
      if (intro) {
        const r = intro.step(now, d.mask);
        if (r.cutoff !== null) {
          d.cloud.setVisibility(d.mask);
          hudStore.shown = r.shown;
          hudStore.introDate = new Date(r.cutoff).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }); // prettier-ignore
        }
        if (r.done) {
          intro = null;
          hudStore.introDate = '';
          datasets.session().refresh(); // back to the real view
        }
      }
      d.earth?.update(sunDir, dt);
      d.earth?.setXray(xray.eased);
      d.cloud.setDepthMix(xray.eased);
      d.shockwaves?.update(now, config.shockwavePeriodMs, reduceMotion || intro ? 0 : 1 - xray.eased); // prettier-ignore
      d.cloud.update(dt, orbit.distance, sm.pixelScale);
      const handCursor = cursor.visible ? cursor.position : null;
      const canPick = mode === 'pointing' || mode === 'idle';
      const occluded = !!d.earth && xray.eased < 0.5; // the solid crust hides the far side
      hover.update(sm.camera, d.cloud, d.base, d.schema, handCursor, canPick, occluded);
      hoverMarker.update(d.cloud, hover.current, xray.eased, now, sm.camera);
    }
    hudStore.shownDisplay = approach(hudStore.shownDisplay, hudStore.shown, 0.15);
    hudStore.renderFps = sm.fps;
    hudStore.frameMs = sm.frameMs;
  });
  sm.start();

  // --- hand tracking (its own loop) ---
  const recorder = new LandmarkRecorder();
  let video: HTMLVideoElement | null = null;
  cleanups.push(
    startTracking(els.camCanvas, {
      onVideo(v) {
        video = v;
      },
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
    skipIntro();
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
    } else if (e.code === 'Escape') {
      lasso.clear();
    } else if (e.code === 'KeyX') {
      xray.toggle();
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
    importCsv: async (file) => importCsv(await db, file),
    async captureGesture(label, onProgress) {
      if (!video) throw new Error('camera is not running');
      await captureFrames(video, label, config.captureFrames, config.captureIntervalMs, onProgress);
    },
    async finishCsv(imp, mapping) {
      datasets.addCustom(imp.name, buildCsvDataset(sm.scene, imp, mapping));
      await showDataset(imp.name, false);
      const c = centroid(imp.base, mapping);
      camera.flyTo(c.lat, c.lon, performance.now());
      toast('info', `${imp.fileName}: ${imp.base.numRows.toLocaleString()} rows. Ask about them by voice.`); // prettier-ignore
    },
    undo: () => datasets.session().undo(),
    resetView: () => camera.reset(performance.now()),
    toggleXray: () => xray.toggle(),
    replayIntro() {
      if (datasets.active === DATASETS[0]) startIntro();
    },
  };
}
