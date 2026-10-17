// Playground release wiring: suggestion chips, the dashboard, the time machine and
// share links. runtime.ts only calls these hooks; the logic lives in pure modules.
import { config } from './config.ts';
import { chipSpec, loadChips, surprise } from './data/chips.ts';
import type { Chip } from './data/chips.ts';
import { refine } from './data/refine.ts';
import type { Datasets } from './datasets.ts';
import { computeDashboard, filterFor } from './hud/dashboard.ts';
import type { Bar, Chart } from './hud/dashboard.ts';
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

  constructor(host: PlaygroundHost) {
    this.host = host;
  }

  /** A dataset came on screen: its time range (for the time machine) and its chips. */
  async onDataset(name: string, d: LoadedDataset): Promise<void> {
    const timeCol = d.schema.columns.find((c) => c.type === 'timestamp')?.name;
    const times = timeCol ? (d.base.numbers.get(timeCol) ?? null) : null;
    this.time.attach(times);
    this.ripples = [];
    if (times) d.cloud.setTimes(times, timeRange(times)[0]);
    hudStore.chips = [];
    const chips = await loadChips(name);
    if (this.host.datasets.active === name) hudStore.chips = chips;
  }

  /** A view was applied (query, undo, refresh): recompute the dashboard, re-mask the replay. */
  onView(d: LoadedDataset): void {
    hudStore.dashboard = computeDashboard(d.schema, d.base, d.cloud.visible);
    this.time.onView(d.cloud.visible);
  }

  pickChip(chip: Chip): void {
    const { datasets } = this.host;
    void datasets.session().applySpec(chipSpec(chip, datasets.active));
  }

  surpriseMe(): void {
    const { datasets } = this.host;
    if (hudStore.chips.length === 0) return;
    const chip = surprise(hudStore.chips, datasets.active, datasets.session().current);
    toast('info', `🎲 ${chip.label}`);
    this.pickChip(chip);
  }

  pickBar(chart: Chart, bar: Bar): void {
    const { datasets } = this.host;
    const s = datasets.session();
    void s.applySpec(refine(s.current, datasets.active, filterFor(chart, bar)));
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
    this.time.seekFraction(f);
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

  /** L plays / pauses the time machine. */
  onKey(code: string): boolean {
    if (code !== 'KeyL' || !this.time.available) return false;
    this.toggleTime();
    return true;
  }

  /** Every render frame (not while the fly-in intro runs). */
  onFrame(dt: number, d: LoadedDataset): void {
    const { time } = this;
    const r = time.step(dt, d.cloud);
    hudStore.playback = { available: time.available, playing: time.playing, speed: time.speed };
    if (!r) return;
    if (r.ended) {
      this.ripples = [];
      hudStore.introCutoff = null;
      hudStore.introDate = '';
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
