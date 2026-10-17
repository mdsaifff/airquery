// End to end with a mocked agent: utterance -> agent JSON (zod-validated) ->
// DuckDB (fake) -> applyView -> the globe's point buffers.
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatasetSchema, Pointer, QuerySpec } from '../contracts/contracts.ts';
import { applyView } from '../scene/applyView.ts';
import { PointCloud } from '../scene/pointCloud.ts';
import { positionsFor } from '../scene/positions.ts';
import { askAgent, compileSpec } from './agentClient.ts';
import type { Columns } from './arrow.ts';
import { QuerySession } from './querySession.ts';
import { indexIds } from './resultMask.ts';

const SCHEMA: DatasetSchema = {
  dataset: 'quakes',
  table: 'quakes',
  description: 'test',
  id: 'id',
  position: { kind: 'geo', lat: 'lat', lon: 'lon', depth: 'depth_km' },
  columns: [
    { name: 'depth_km', type: 'number', unit: 'km', min: 10, max: 600 },
    { name: 'magnitude', type: 'number', min: 4.5, max: 7.5 },
  ],
  default_color_by: 'depth_km',
  default_size_by: 'magnitude',
};

const BASE: Columns = {
  numRows: 4,
  numbers: new Map([
    ['lat', new Float64Array([0, 10, 20, 30])],
    ['lon', new Float64Array([0, 10, 20, 30])],
    ['depth_km', new Float64Array([10, 350, 50, 600])],
    ['magnitude', new Float64Array([4.5, 5, 7.5, 6])],
  ]),
  strings: new Map([['id', ['a', 'b', 'c', 'd']]]),
};

const spec = (over: Partial<QuerySpec>): QuerySpec => ({
  version: 1,
  dataset: 'quakes',
  intent: 'query',
  mode: 'refine',
  filters: [],
  color_by: null,
  size_by: null,
  sort: null,
  limit: null,
  camera_target: null,
  timeline: null,
  view: null,
  switch_to: null,
  ...over,
});

const okResponse = (s: QuerySpec, sql: string, params: (string | number)[]) => ({
  status: 'ok',
  spec: s,
  sql,
  params,
  message: null,
  retries: 0,
  timings_ms: { llm: 600, total: 640 },
});

/** Stub fetch so askAgent (and its zod validation) runs for real. */
function agentReplies(...bodies: unknown[]) {
  const fetchMock = vi.fn(async () => ({ json: async () => bodies.shift() }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const SCENES = [
  { name: 'quakes', title: 'earthquake globe' },
  { name: 'papers', title: 'ML paper galaxy' },
];

function rig() {
  const globe = new PointCloud(new THREE.Scene(), positionsFor(SCHEMA, BASE, 3));
  const mask = new Uint8Array(4);
  const idIndex = indexIds(['a', 'b', 'c', 'd']);
  const notes: string[] = [];
  const flights: [number, number][] = [];
  const legends: (string | null)[] = [];
  const runs: string[] = [];
  let pointer: Pointer | null = null;
  const session = new QuerySession({
    dataset: 'quakes',
    ask: (req) => askAgent(req, 'http://agent.test'),
    compile: (req) => compileSpec(req, 'http://agent.test'),
    // Fake DuckDB: deep quakes for "> ?" queries, otherwise everything.
    run: async (sql, params) => {
      runs.push(`${sql} ${JSON.stringify(params)}`);
      const ids = sql.includes('>') ? ['b', 'd'] : ['a', 'b', 'c', 'd'];
      return { numRows: ids.length, numbers: new Map(), strings: new Map([['id', ids]]) };
    },
    show: (view) => legends.push(applyView(globe, BASE, SCHEMA, idIndex, mask, view).legend?.column ?? null), // prettier-ignore
    flyTo: (lat, lon) => flights.push([lat, lon]),
    explain: (p) => notes.push(p ? `explain:${p.lat},${p.lon}` : 'explain'),
    resetView: () => notes.push('resetView'),
    notify: (kind, text) => notes.push(`${kind}:${text}`),
    pointer: () => pointer,
    timeline: (t) => notes.push(`timeline:${t.action}`),
    view: (v) => notes.push(`view:${JSON.stringify(v)}`),
    scenes: () => SCENES,
    switchTo: (name) => notes.push(`switch:${name}`),
  });
  const colors = () => Array.from(globe['geometry'].getAttribute('aColor').array as Float32Array); // prettier-ignore
  const alpha = () => Array.from(globe['geometry'].getAttribute('aAlpha').array as Float32Array); // prettier-ignore
  const setPointer = (p: Pointer | null) => (pointer = p);
  return { globe, session, notes, flights, legends, runs, colors, alpha, setPointer };
}

const DEEP = spec({ filters: [{ field: 'depth_km', op: '>', value: 300 }] });
const DEEP_SQL = 'SELECT "id", "lat", "lon", "depth_km" FROM "quakes" WHERE "depth_km" > ?';

describe('voice to scene (mocked agent)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a filter response hides the other points and fades them out', async () => {
    const fetchMock = agentReplies(okResponse(DEEP, DEEP_SQL, [300]));
    const r = rig();
    await r.session.submit('only deeper than 300 km', 0);
    expect(fetchMock).toHaveBeenCalledOnce();
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body); // prettier-ignore
    expect(sent).toEqual({ dataset: 'quakes', utterance: 'only deeper than 300 km', current_spec: null, dataset_schema: null, pointer: null, scenes: SCENES }); // prettier-ignore
    expect(r.runs).toEqual([`${DEEP_SQL} [300]`]);
    expect([...r.globe.visible]).toEqual([0, 1, 0, 1]);
    r.globe.update(10_000, 3, 1000); // let the fade finish
    expect(r.alpha()).toEqual([0, 1, 0, 1]);
    expect(r.session.current).toEqual(DEEP);
  });

  it('colour by magnitude rewrites the colour buffer and the legend', async () => {
    const coloured = spec({ ...DEEP, color_by: 'magnitude' });
    agentReplies(okResponse(DEEP, DEEP_SQL, [300]), okResponse(coloured, DEEP_SQL, [300]));
    const r = rig();
    await r.session.submit('deeper than 300', 0);
    const byDepth = r.colors();
    await r.session.submit('colour them by magnitude', 0);
    expect(r.colors()).not.toEqual(byDepth);
    expect(r.legends).toEqual(['depth_km', 'magnitude']);
    const sentSecond = r.session.current;
    expect(sentSecond?.color_by).toBe('magnitude');
  });

  it('sends the current spec with follow-ups, and undo/reset walk the history', async () => {
    const coloured = spec({ ...DEEP, color_by: 'magnitude' });
    const fetchMock = agentReplies(
      okResponse(DEEP, DEEP_SQL, [300]),
      okResponse(coloured, DEEP_SQL, [300]),
      okResponse(spec({ intent: 'undo' }), '', []),
    );
    const r = rig();
    await r.session.submit('deeper than 300', 0);
    await r.session.submit('colour by magnitude', 0);
    const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body); // prettier-ignore
    expect(second.current_spec).toEqual(DEEP);
    await r.session.submit('undo', 0); // spoken undo: no new SQL
    expect(r.session.current).toEqual(DEEP);
    expect(r.runs).toHaveLength(2);
    r.session.reset();
    expect(r.session.current).toBeNull();
    expect([...r.globe.visible]).toEqual([1, 1, 1, 1]);
    expect(r.notes).toContain('resetView');
    r.session.undo();
    expect(r.notes.at(-1)).toBe('info:Nothing to undo.');
  });

  it('navigate flies the camera without re-querying', async () => {
    const chile = spec({ intent: 'navigate', camera_target: { lat: -33, lon: -70, label: 'Chile' } }); // prettier-ignore
    agentReplies(okResponse(chile, 'SELECT 1', []));
    const r = rig();
    await r.session.submit('fly to Chile', 0);
    expect(r.flights).toEqual([[-33, -70]]);
    expect(r.runs).toEqual([]);
  });

  it('clarify and rejected become toasts and change nothing', async () => {
    agentReplies(
      {
        ...okResponse(DEEP, '', []),
        status: 'clarify',
        spec: null,
        sql: null,
        message: 'How big?',
      },
      { ...okResponse(DEEP, '', []), status: 'rejected', spec: null, sql: null, message: 'No.' },
    );
    const r = rig();
    await r.session.submit('the big ones', 0);
    await r.session.submit('papers', 0);
    expect(r.notes).toEqual(['clarify:How big?', 'error:No.']);
    expect(r.runs).toEqual([]);
    expect([...r.globe.visible]).toEqual([1, 1, 1, 1]);
  });

  it('a malformed agent reply is rejected by zod before anything runs', async () => {
    agentReplies({ status: 'ok', spec: { dataset: 'quakes' }, sql: 'DROP TABLE quakes' });
    const r = rig();
    await r.session.submit('anything', 0);
    expect(r.notes[0]).toMatch(/^error:Agent unreachable or invalid reply/);
    expect(r.runs).toEqual([]);
  });

  it('mouse baseline: a UI-built spec goes through /compile, not the LLM', async () => {
    const fetchMock = agentReplies(okResponse(DEEP, DEEP_SQL, [300]));
    const r = rig();
    await r.session.applySpec(DEEP);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('http://agent.test/compile');
    expect(JSON.parse(init.body)).toEqual({ dataset: 'quakes', spec: DEEP });
    expect([...r.globe.visible]).toEqual([0, 1, 0, 1]);
    r.session.undo();
    expect([...r.globe.visible]).toEqual([1, 1, 1, 1]);
  });

  it('latest request wins when replies arrive out of order', async () => {
    const deeper = spec({ filters: [{ field: 'depth_km', op: '>', value: 500 }] });
    const releases: (() => void)[] = [];
    const bodies = [okResponse(DEEP, DEEP_SQL, [300]), okResponse(deeper, DEEP_SQL, [500])];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const body = bodies.shift();
        await new Promise<void>((resolve) => releases.push(resolve));
        return { json: async () => body };
      }),
    );
    const r = rig();
    const first = r.session.applySpec(DEEP);
    const second = r.session.applySpec(deeper);
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[1](); // the newer reply arrives first...
    await second;
    releases[0](); // ...then the stale one
    await first;
    expect(r.session.current).toEqual(deeper);
    expect(r.runs).toHaveLength(1);
  });

  it('explain asks the scene for a summary instead of re-querying', async () => {
    agentReplies(okResponse(spec({ intent: 'explain' }), 'SELECT 1', []));
    const r = rig();
    await r.session.submit("what's this?", 0);
    expect(r.notes).toEqual(['explain']);
    expect(r.runs).toEqual([]);
  });
});

describe('refresh', () => {
  it('re-shows the current view without a voice end time (no fake latency sample)', () => {
    const ended: (number | null)[] = [];
    const session = new QuerySession({
      dataset: 'quakes',
      ask: () => Promise.reject(new Error('unused')),
      compile: () => Promise.reject(new Error('unused')),
      run: () => Promise.reject(new Error('unused')),
      show: (_view, _applied, endedAt) => ended.push(endedAt),
      flyTo: () => {},
      explain: () => {},
      resetView: () => {},
      notify: () => {},
      pointer: () => null,
      timeline: () => {},
      view: () => {},
      scenes: () => [],
      switchTo: () => {},
    });
    session.refresh();
    expect(ended).toEqual([null]);
  });

  it('routes timeline and view commands without touching the history', async () => {
    const r = rig();
    const timeline = { action: 'play' as const, date: null, speed: 'month' as const };
    const view = { xray: true, stats: null, share: null, mute: null };
    agentReplies(
      { ...okResponse(spec({ intent: 'timeline', timeline }), '', []), sql: null },
      { ...okResponse(spec({ intent: 'view', view }), '', []), sql: null },
    );
    await r.session.submit('play the year', 0);
    await r.session.submit('x-ray on', 0);
    expect(r.notes).toEqual(['timeline:play', `view:${JSON.stringify(view)}`]);
    expect(r.session.current).toBeNull(); // nothing pushed onto the history
    expect(r.runs).toEqual([]); // no SQL ran
  });

  it('routes a scene switch without touching the history', async () => {
    const r = rig();
    agentReplies({ ...okResponse(spec({ intent: 'switch', switch_to: 'papers' }), '', []), sql: null }); // prettier-ignore
    await r.session.submit('switch to the paper galaxy', 0);
    expect(r.notes).toEqual(['switch:papers']);
    expect(r.session.current).toBeNull();
    expect(r.runs).toEqual([]);
  });

  it('typed commands use the pointer at submit time', async () => {
    const r = rig();
    r.setPointer({ lat: 35, lon: 139 });
    const fetchMock = agentReplies({
      ...okResponse(spec({ intent: 'explain' }), '', []),
      sql: null,
    });
    await r.session.submit('what happened here?', 0);
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body); // prettier-ignore
    expect(sent.pointer).toEqual({ lat: 35, lon: 139 });
  });

  it('only commands that point somewhere send the pointer', async () => {
    const r = rig();
    r.setPointer({ lat: 35, lon: 139 });
    const fetchMock = agentReplies(
      { ...okResponse(spec({ intent: 'timeline', timeline: { action: 'play', date: null, speed: null } }), '', []), sql: null }, // prettier-ignore
      { ...okResponse(spec({ intent: 'explain' }), '', []), sql: null },
    );
    await r.session.submit('play the year', 0); // no "here": cacheable, no pointer
    await r.session.submit('show me what is around here', 0);
    const sent = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body).pointer); // prettier-ignore
    expect(sent).toEqual([null, { lat: 35, lon: 139 }]);
  });

  it('"what happened here?" explains the place that was sent', async () => {
    const r = rig();
    r.setPointer({ lat: 35, lon: 139 });
    agentReplies({ ...okResponse(spec({ intent: 'explain' }), '', []), sql: null });
    const asked = r.session.submit('what happened here?', 0);
    r.setPointer({ lat: 0, lon: 0 }); // the hand moved on while the agent answered
    await asked;
    expect(r.notes).toEqual(['explain:35,139']);
  });
});
