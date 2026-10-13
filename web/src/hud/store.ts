// Per-frame values the HUD shows. Written imperatively by the loops; React
// components poll it (useTick) instead of holding per-frame data in state.
import { useEffect, useState } from 'react';

import type { Mode } from '../interaction/stateMachine.ts';

export const hudStore = {
  mode: 'idle' as Mode,
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
  /** Loading / error line under the stats. */
  status: 'loading data…',
  /** Shown when the camera or tracker can't start; the app falls back to mouse mode. */
  cameraError: '',
  /** Live transcript; final once speech ended or text was typed. */
  transcript: '',
  transcriptFinal: false,
  toasts: [] as Toast[],
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
