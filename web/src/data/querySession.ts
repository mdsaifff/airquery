// Voice/typed utterance -> agent -> DuckDB -> scene, plus the undo/reset history.
// All I/O is injected, so the whole flow runs in tests with a mocked agent.
import type {
  CompileRequest,
  QueryRequest,
  QueryResponse,
  QuerySpec,
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
  ask(req: QueryRequest): Promise<QueryResponse>;
  /** Validate + compile a spec built in the UI (mouse baseline). */
  compile(req: CompileRequest): Promise<QueryResponse>;
  run(sql: string, params: Param[]): Promise<Columns>;
  /** Push a view to the scene; endedAt starts the voice-to-render clock. */
  show(view: SceneView, applied: Applied, endedAt: number): void;
  flyTo(lat: number, lon: number): void;
  resetView(): void;
  notify(kind: 'info' | 'clarify' | 'error', text: string): void;
}

interface Entry extends Applied {
  result: Columns | null;
}

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
    const { deps } = this;
    const req = { dataset: deps.dataset, utterance, current_spec: this.current };
    await this.handle(() => deps.ask(req), endedAt);
  }

  /** Mouse baseline: apply a spec built from dropdowns (still validated by the agent). */
  async applySpec(spec: QuerySpec, endedAt = performance.now()): Promise<void> {
    await this.handle(() => this.deps.compile({ dataset: this.deps.dataset, spec }), endedAt);
  }

  private async handle(request: () => Promise<QueryResponse>, endedAt: number): Promise<void> {
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

  private show(e: Entry, endedAt: number): void {
    const view = { result: e.result, colorBy: e.spec?.color_by ?? null, sizeBy: e.spec?.size_by ?? null }; // prettier-ignore
    this.deps.show(view, { spec: e.spec, sql: e.sql, params: e.params }, endedAt);
  }
}
