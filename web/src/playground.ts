// Playground release wiring: suggestion chips, the dashboard, the time machine and
// share links. runtime.ts only calls these hooks; the logic lives in pure modules.
import { chipSpec, loadChips, surprise } from './data/chips.ts';
import type { Chip } from './data/chips.ts';
import { refine } from './data/refine.ts';
import type { Datasets } from './datasets.ts';
import { computeDashboard, filterFor } from './hud/dashboard.ts';
import type { Bar, Chart } from './hud/dashboard.ts';
import { hudStore, toast } from './hud/store.ts';
import type { LoadedDataset } from './scene/loadDataset.ts';

export interface PlaygroundHost {
  datasets: Datasets;
}

export class Playground {
  private readonly host: PlaygroundHost;

  constructor(host: PlaygroundHost) {
    this.host = host;
  }

  /** A dataset came on screen: its chips. */
  async onDataset(name: string): Promise<void> {
    hudStore.chips = [];
    const chips = await loadChips(name);
    if (this.host.datasets.active === name) hudStore.chips = chips;
  }

  /** A view was applied (query, undo, refresh): recompute the dashboard. */
  onView(d: LoadedDataset): void {
    hudStore.dashboard = computeDashboard(d.schema, d.base, d.cloud.visible);
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
}
