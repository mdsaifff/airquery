// Playground release wiring: the dashboard, the time machine and
// share links. runtime.ts only calls these hooks; the logic lives in pure modules.
import { config } from './config.ts';
import type { Datasets } from './datasets.ts';
import { computeDashboard } from './hud/dashboard.ts';
import { timeRange } from './hud/seismogram.ts';
import { hudStore, toast } from './hud/store.ts';
import type { LoadedDataset } from './scene/loadDataset.ts';
import { TimeMachine } from './scene/timeMachine.ts';
import type { XrayState } from './scene/xray.ts';
import type { CameraController } from './interaction/cameraController.ts';
import { decodeShare, encodeShare } from './share.ts';

export interface PlaygroundHost {
  datasets: Datasets;
  /** End the first-load fly-in replay (the time machine takes over the points). */
  skipIntro(): void;
  camera: CameraController;
  xray: XrayState;
}

const DATE: Intl.DateTimeFormatOptions = { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }; // prettier-ignore

export class Playground {
  readonly time = new TimeMachine();
  private readonly host: PlaygroundHost;
  private ripples: number[] = [];
  /** The dataset on screen, so a scene switch or Esc can switch its replay off. */
  private current: LoadedDataset | null = null;

  constructor(host: PlaygroundHost) {
    this.host = host;
  }

  /** A dataset came on screen: its time range (for the time machine). */
  onDataset(d: LoadedDataset): void {
    if (this.current && this.time.active) {
      this.time.stop(this.current.cloud); // the old scene's glow and cutoff go too
      this.clearPlayhead();
    }
    this.current = d;
    const timeCol = d.schema.columns.find((c) => c.type === 'timestamp')?.name;
    const times = timeCol ? (d.base.numbers.get(timeCol) ?? null) : null;
    this.time.attach(times);
    this.ripples = [];
    if (times) d.cloud.setTimes(times, timeRange(times)[0]);
  }

  /** A view was applied (query, undo, refresh): recompute the dashboard, re-mask the replay. */
  onView(d: LoadedDataset): void {
    hudStore.dashboard = computeDashboard(d.schema, d.base, d.cloud.visible);
    this.time.onView(d.cloud.visible);
  }

  /** "Replay the year": the time machine from Jan 1. */
  playYear(): void {
    this.host.skipIntro();
    this.time.play(true);
  }

  toggleTime(): void {
    this.host.skipIntro();
    this.time.toggle();
  }

  seekFraction(f: number): void {
    this.host.skipIntro();
    if (f >= 0.995) return this.stopTime(); // the end of the strip = "now": leave the replay
    this.time.seekFraction(f);
  }

  /** Leave the time machine (✕, Esc, or the end of the strip): the full selection again. */
  stopTime(): void {
    if (!this.time.active || !this.current) return;
    this.time.stop(this.current.cloud);
    this.clearPlayhead();
    this.host.datasets.session().refresh(); // the selection, its count and strongest rings
  }

  private clearPlayhead(): void {
    this.ripples = [];
    hudStore.introCutoff = null;
    hudStore.introDate = '';
  }

  setSpeed(daysPerSec: number): void {
    this.time.setSpeed(daysPerSec);
  }

  share(): void {
    const { datasets, camera, xray } = this.host;
    const hash = encodeShare({
      v: 1,
      dataset: datasets.active,
      spec: datasets.session().current,
      orbit: { ...camera.orbit },
      xray: xray.target === 1,
      day: this.time.active ? Math.round(this.time.day * 10) / 10 : null,
    });
    const url = `${location.origin}${location.pathname}${location.search}${hash}`;
    history.replaceState(null, '', url);
    navigator.clipboard?.writeText(url).then(
      () => toast('info', 'Link copied. Anyone who opens it sees this view.'),
      () => toast('info', 'Link is in the address bar: copy it from there.'),
    );
  }

  /** Restore a shared view from the URL hash; true if one was applied. */
  restore(hash: string): boolean {
    if (!hash) return false;
    const s = decodeShare(hash);
    const { datasets, camera, xray } = this.host;
    if (!s || s.dataset !== datasets.active) {
      toast('clarify', "Couldn't restore that link; showing the full view.");
      return false;
    }
    camera.setOrbit(s.orbit, performance.now());
    if ((xray.target === 1) !== s.xray) xray.toggle();
    if (s.spec) void datasets.session().applySpec(s.spec);
    if (s.day !== null) this.time.seek(s.day);
    return true;
  }

  /** L plays / pauses the time machine; Esc leaves it (and still clears the lasso). */
  onKey(code: string): boolean {
    if (code === 'Escape') this.stopTime();
    if (code !== 'KeyL' || !this.time.available) return false;
    this.toggleTime();
    return true;
  }

  /** Every render frame (not while the fly-in intro runs). */
  onFrame(dt: number, d: LoadedDataset): void {
    const { time } = this;
    const r = time.step(dt, d.cloud);
    hudStore.playback = {
      available: time.available,
      active: time.active,
      playing: time.playing,
      speed: time.speed,
    };
    if (!r) return;
    if (r.ended) {
      this.clearPlayhead();
      this.host.datasets.session().refresh(); // the selection, its count and strongest rings
      return;
    }
    if (r.shown >= 0) hudStore.shown = r.shown;
    const cutoff = time.cutoffMs();
    hudStore.introCutoff = cutoff;
    hudStore.introDate = new Date(cutoff).toLocaleDateString('en-US', DATE);
    const sizeCol = d.schema.default_size_by;
    const values = sizeCol ? d.base.numbers.get(sizeCol) : undefined;
    if (r.arrived.length > 0 && d.shockwaves && values) {
      this.ripples = [...this.ripples, ...r.arrived].slice(-config.timeRipples);
      const min = hudStore.sizeLegend?.min ?? 0; // rings sized from the smallest event up
      d.shockwaves.set(this.ripples, d.cloud.surfacePositions, d.cloud.colors, values, min);
    }
  }
}
