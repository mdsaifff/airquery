// Scenes the user can swipe between: one point cloud + query history per dataset,
// loaded lazily the first time it is shown.
import type * as THREE from 'three';
import type { Db } from './data/db.ts';
import { QuerySession } from './data/querySession.ts';
import type { SessionDeps } from './data/querySession.ts';
import { loadDataset } from './scene/loadDataset.ts';
import type { LoadedDataset } from './scene/loadDataset.ts';

export class Datasets {
  active: string;
  private readonly names: string[];
  private readonly scene: THREE.Scene;
  private readonly db: Promise<Db>;
  private readonly depsFor: (name: string) => SessionDeps;
  private readonly loaded = new Map<string, LoadedDataset>();
  private readonly loading = new Map<string, Promise<LoadedDataset>>();
  private readonly sessions = new Map<string, QuerySession>();

  constructor(
    names: readonly string[],
    scene: THREE.Scene,
    db: Promise<Db>,
    depsFor: (name: string) => SessionDeps,
  ) {
    this.names = [...names];
    this.active = names[0];
    this.scene = scene;
    this.db = db;
    this.depsFor = depsFor;
  }

  get(name: string): LoadedDataset | undefined {
    return this.loaded.get(name);
  }

  current(): LoadedDataset | undefined {
    return this.loaded.get(this.active);
  }

  session(name = this.active): QuerySession {
    let s = this.sessions.get(name);
    if (!s) {
      s = new QuerySession(this.depsFor(name));
      this.sessions.set(name, s);
    }
    return s;
  }

  ensure(name: string): Promise<LoadedDataset> {
    let p = this.loading.get(name);
    if (!p) {
      p = this.db.then((db) => loadDataset(db, this.scene, name));
      p.then((d) => this.loaded.set(name, d)).catch(() => this.loading.delete(name)); // retry later
      this.loading.set(name, p);
    }
    return p;
  }

  /** Add a dataset built in the browser (a dropped CSV) to the swipe order. */
  addCustom(name: string, d: LoadedDataset): void {
    this.loaded.get(name)?.cloud.dispose(); // same file dropped again
    if (!this.names.includes(name)) this.names.push(name);
    this.loaded.set(name, d);
    this.loading.set(name, Promise.resolve(d));
    this.sessions.delete(name);
  }

  /** The dataset a swipe would show next (left = next, right = previous). */
  neighbour(direction: 'left' | 'right'): string {
    const i = this.names.indexOf(this.active);
    const step = direction === 'left' ? 1 : -1;
    return this.names[(i + step + this.names.length) % this.names.length];
  }

  /** Show only `name`'s cloud; loads it first if needed. */
  async show(name: string): Promise<LoadedDataset> {
    const d = await this.ensure(name);
    this.active = name;
    for (const [n, other] of this.loaded) other.cloud.group.visible = n === name;
    return d;
  }

  dispose(): void {
    for (const d of this.loaded.values()) d.cloud.dispose();
    void this.db.then((db) => db.close());
  }
}
