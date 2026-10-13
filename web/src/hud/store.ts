// Per-frame values the HUD shows. Written imperatively by the loops; React
// components poll it (useTick) instead of holding per-frame data in state.
import { useEffect, useReducer } from 'react';

export const hudStore = {
  trackingFps: 0,
  /** Shown when the camera or tracker can't start; the app falls back to mouse mode. */
  cameraError: '',
};

/** Re-render the calling component `hz` times per second. */
export function useTick(hz = 10): void {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(tick, 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
}
