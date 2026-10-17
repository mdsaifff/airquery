// Per-frame values the HUD shows. Written imperatively by the loops; React
// components poll it (useTick) instead of holding per-frame data in state.
import { useEffect, useState } from 'react';

import type { QuerySpec } from '../contracts/contracts.ts';
import type { Chip } from '../data/chips.ts';
import type { Dashboard } from './dashboard.ts';
import type { Mode } from '../interaction/stateMachine.ts';
import type { Legend } from '../scene/applyView.ts';

export const hudStore = {
  mode: 'idle' as Mode,
  /** Which scene is on screen (dataset name). */
  dataset: 'quakes',
  /** Push-to-talk is held (hand Victory or spacebar). */
  listening: false,
  trackingFps: 0,
  renderFps: 0,
  /** Smoothed CPU time per render frame (ms). */
  frameMs: 0,
  /** Last DuckDB query time (ms). */
  queryMs: 0,
  /** Points currently shown / total. */
  shown: 0,
  total: 0,
  /** `shown`, eased toward its target each frame (the title bar's ticking count). */
  shownDisplay: 0,
  /** Loading / error line under the stats. */
  status: 'loading data…',
  /** Shown when the camera or tracker can't start; the app falls back to mouse mode. */
  cameraError: '',
  /** Live transcript; final once speech ended or text was typed. */
  transcript: '',
  transcriptFinal: false,
  toasts: [] as Toast[],
  /** What is on screen: the spec, and the exact SQL + params DuckDB ran ("glass box"). */
  glass: { spec: null as QuerySpec | null, sql: null as string | null, params: [] as unknown[] },
  legend: null as Legend | null,
  sizeLegend: null as { column: string; min: number; max: number } | null,
  /** Last voice-to-render latency (ms) and the agent's per-stage timings. */
  latencyMs: 0,
  timings: {} as Record<string, number>,
  /** A request is waiting on the agent. */
  thinking: false,
  /** Mouse baseline mode (B): hands and voice off, dropdown filters on. */
  baseline: false,
  /** X-ray mode is on (target), the scene is a globe, and its depth column (if any). */
  xray: false,
  geo: true,
  depthColumn: null as string | null,
  /** Date shown while the opening replay runs ('' otherwise), and its time (epoch ms, null otherwise). */
  introDate: '',
  introCutoff: null as number | null,
  /** The seismogram strip's source: the dataset's time column, its numbers (sized by the size
   * legend's column) and the live colour/visibility arrays of its point cloud. Null without time. */
  timeline: null as {
    times: ArrayLike<number>;
    numbers: Map<string, ArrayLike<number>>;
    colors: Float32Array;
    visible: Uint8Array;
  } | null,
  /** Charts for what is on screen (recomputed per view change), or null before data. */
  dashboard: null as Dashboard | null,
  /** Suggestion chips for the current dataset (empty: no chips file). */
  chips: [] as Chip[],
  /** One-line description of the current dataset (from its schema). */
  subtitle: '',
  /** Place choices for the baseline dropdown (computed examples from the dataset schema). */
  placeOptions: [] as string[],
};

export interface Toast {
  id: number;
  kind: 'info' | 'clarify' | 'error';
  text: string;
  /** Hide after this performance.now() time (ms). */
  until: number;
}

let toastId = 0;
const TOAST_MS = { info: 3000, clarify: 8000, error: 6000 };

export function toast(kind: Toast['kind'], text: string): void {
  const now = performance.now();
  hudStore.toasts = [
    ...hudStore.toasts.filter((t) => t.until > now).slice(-3),
    { id: ++toastId, kind, text, until: now + TOAST_MS[kind] },
  ];
}

/** Re-render the calling component `hz` times per second; returns the tick time (ms). */
export function useTick(hz = 10): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return now;
}
