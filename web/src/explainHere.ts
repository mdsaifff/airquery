// "What's this?": ids near the pointer -> the agent compiles aggregate SQL ->
// DuckDB computes the numbers -> one sentence, shown and spoken. No LLM involved.
import type * as THREE from 'three';
import { config } from './config.ts';
import { explainIds } from './data/agentClient.ts';
import type { Db } from './data/db.ts';
import { explainSentence, firstRow } from './data/explain.ts';
import type { Datasets } from './datasets.ts';
import type { Hover } from './hud/hover.ts';
import { hudStore, toast } from './hud/store.ts';
import { speak } from './voice/speak.ts';

export interface ExplainContext {
  datasets: Datasets;
  hover: Hover;
  camera: THREE.PerspectiveCamera;
  db: Promise<Db>;
  /** A lasso selection wins over "points near the pointer". */
  selection: () => number[] | null;
}

/** "What's this?": ids near the pointer -> agent compiles aggregates -> DuckDB -> sentence. */
export async function explainHere(ctx: ExplainContext, name: string): Promise<void> {
  const { datasets, hover, camera, db, selection } = ctx;
  const d = datasets.get(name);
  if (!d) return;
  const geo = d.schema.position.kind === 'geo';
  const picked = selection() ?? hover.nearby(camera, d.cloud, config.explainRadiusPx, geo);
  const ids = d.base.strings.get(d.schema.id ?? 'id') ?? [];
  if (picked.length === 0) return toast('info', 'Point at some points first, then ask again.');
  try {
    const [first, ...rest] = picked.slice(0, 5000).map((i) => ids[i]); // non-empty: checked above
    const resp = await explainIds({ dataset: name, ids: [first, ...rest] });
    if (resp.status !== 'ok' || !resp.sql)
      return toast('error', resp.message ?? 'Could not summarize.');
    const sentence = explainSentence(name, firstRow(await (await db).run(resp.sql, resp.params)));
    hudStore.glass = { spec: datasets.session(name).current, sql: resp.sql, params: [`… ${picked.length} ids`] }; // prettier-ignore
    toast('info', sentence);
    speak(sentence);
  } catch (err) {
    toast('error', `Summary failed: ${String(err)}`);
  }
}
