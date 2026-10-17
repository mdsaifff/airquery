// Voice/typed utterance -> agent -> DuckDB -> scene, plus the undo/reset history.
// All I/O is injected, so the whole flow runs in tests with a mocked agent.
import type {
  CompileRequest,
  Pointer,
  DatasetSchema,
  QueryRequest,
  QueryResponse,
  QuerySpec,
  Timeline,
  ViewChange,
} from '../contracts/contracts.ts';
import type { Columns } from './arrow.ts';
import type { Param } from './db.ts';

/** What the scene should show. A null result means "every point". */
export interface SceneView {
  result: Columns | null;
  colorBy: string | null;
  sizeBy: string | null;
}

export interface Applied {
  spec: QuerySpec | null;
  sql: string | null;
  params: Param[];
}

export interface SessionDeps {
  dataset: string;
  /** Only for user-dropped CSVs: the schema inferred in the browser, sent along. */
  datasetSchema?: DatasetSchema;
  ask(req: QueryRequest): Promise<QueryResponse>;
  /** Validate + compile a spec built in the UI (mouse baseline). */
  compile(req: CompileRequest): Promise<QueryResponse>;
  run(sql: string, params: Param[]): Promise<Columns>;
  /** Push a view to the scene; endedAt starts the voice-to-render clock. */
  /** endedAt: when the voice/typed request ended, or null for a plain re-show (no latency sample). */
  show(view: SceneView, applied: Applied, endedAt: number | null): void;
  flyTo(lat: number, lon: number): void;
  /** "What's this?": summarize what is under the pointer (or the lasso selection). */
  explain(pointer: Pointer | null): void;
  resetView(): void;
  notify(kind: 'info' | 'clarify' | 'error', text: string): void;
  /** The globe point under the hand or mouse ("here"), or null. Read when a request is sent. */
  pointer(): Pointer | null;
  /** Time machine commands (play, pause, stop, seek, speed). */
  timeline(t: Timeline): void;
  /** Display switches (X-ray, stats, share, mute). */
  view(v: ViewChange): void;
}

interface Entry extends Applied {
  result: Columns | null;
}

/** Words that point at a place on the globe ("around here", "fly there", "this area"). */
const POINTS_SOMEWHERE = /\b(here|there)\b|\bthis (area|place|region|spot)\b/i;

const EMPTY: Entry = { spec: null, sql: null, params: [], result: null };

export class QuerySession {
  private readonly deps: SessionDeps;
  /** history[history.length - 1] is what's on screen. */
  private history: Entry[] = [EMPTY];
  busy = false;
  /** Bumped per request; a reply for an older request is dropped (latest wins). */
  private seq = 0;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  get current(): QuerySpec | null {
    return this.top.spec;
  }

  private get top(): Entry {
    return this.history[this.history.length - 1];
  }

  async submit(utterance: string, endedAt: number): Promise<void> {
    // Only commands that point somewhere carry "here": the others stay cacheable.
    const { deps } = this;
    const pointer = POINTS_SOMEWHERE.test(utterance) ? deps.pointer() : null;
    const req = {
      dataset: deps.dataset,
      utterance,
      current_spec: this.current,
      dataset_schema: deps.datasetSchema ?? null,
      pointer,
    };
    await this.handle(() => deps.ask(req), endedAt, pointer);
  }

  /** Mouse baseline: apply a spec built from dropdowns (still validated by the agent). */
  async applySpec(spec: QuerySpec, endedAt = performance.now()): Promise<void> {
    await this.handle(() => this.deps.compile({ dataset: this.deps.dataset, spec }), endedAt);
  }

  /** pointer: the "here" the request carried (explain summarises around it). */
  private async handle(
    request: () => Promise<QueryResponse>,
    endedAt: number,
    pointer: Pointer | null = null,
  ): Promise<void> {
    const { deps } = this;
    const id = ++this.seq;
    let resp: QueryResponse;
    this.busy = true;
    try {
      resp = await request();
    } catch (err) {
      if (id === this.seq)
        deps.notify('error', `Agent unreachable or invalid reply (${String(err)})`);
      return;
    } finally {
      if (id === this.seq) this.busy = false;
    }
    if (id !== this.seq) return; // a newer request was made meanwhile
    if (resp.status === 'clarify')
      return deps.notify('clarify', resp.message ?? 'Can you rephrase?');
    if (resp.status === 'rejected')
      return deps.notify('error', resp.message ?? 'Request rejected.');
    const spec = resp.spec;
    if (!spec) return deps.notify('error', 'Agent returned no spec.');

    if (spec.intent === 'undo') return this.undo(endedAt);
    if (spec.intent === 'reset') return this.reset(endedAt);
    if (spec.intent === 'explain') return deps.explain(pointer);
    if (spec.intent === 'timeline') return spec.timeline ? deps.timeline(spec.timeline) : undefined;
    if (spec.intent === 'view') return spec.view ? deps.view(spec.view) : undefined;
    if (spec.intent === 'navigate') {
      if (spec.camera_target) {
        deps.flyTo(spec.camera_target.lat, spec.camera_target.lon);
        deps.notify('info', `flying to ${spec.camera_target.label}`);
      }
      return; // filters unchanged: nothing to re-query
    }
    if (!resp.sql) return deps.notify('error', 'Agent returned no SQL.');
    try {
      const result = await deps.run(resp.sql, resp.params);
      if (id !== this.seq) return;
      const entry: Entry = { spec, sql: resp.sql, params: resp.params, result };
      this.history.push(entry);
      this.show(entry, endedAt);
    } catch (err) {
      deps.notify('error', `Query failed: ${String(err)}`);
    }
  }

  /** Custom gesture: same as saying "what's this?", without the agent round trip. */
  explainNow(): void {
    this.deps.explain(null);
  }

  /** Re-push what is on screen (e.g. after switching back to this dataset). */
  refresh(): void {
    this.show(this.top, null);
  }

  /** Pop the last query (Thumb_Down, Z, or "undo"). */
  undo(endedAt = performance.now()): void {
    this.seq++; // cancels any reply still in flight
    if (this.history.length <= 1) return this.deps.notify('info', 'Nothing to undo.');
    this.history.pop();
    this.show(this.top, endedAt);
  }

  /** Clear every query and reset the camera (Open_Palm, R, or "reset"). */
  reset(endedAt = performance.now()): void {
    this.seq++;
    this.history = [EMPTY];
    this.deps.resetView();
    this.show(EMPTY, endedAt);
  }

  private show(e: Entry, endedAt: number | null): void {
    const view = { result: e.result, colorBy: e.spec?.color_by ?? null, sizeBy: e.spec?.size_by ?? null }; // prettier-ignore
    this.deps.show(view, { spec: e.spec, sql: e.sql, params: e.params }, endedAt);
  }
}
