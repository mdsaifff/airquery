// Replays raw frames through the real tracking + classifier pipeline.
import { config } from '../src/config.ts';
import { GestureClassifier } from '../src/interaction/classifier.ts';
import type { GestureParams } from '../src/interaction/classifier.ts';
import type { GestureEvent } from '../src/interaction/types.ts';
import { toScreen } from '../src/tracking/geometry.ts';
import { HandSmoother } from '../src/tracking/handSmoother.ts';
import type { RawFrame } from '../src/tracking/rawFrame.ts';

// Replay at the camera's own aspect so synthetic hands keep their shape.
const W = 640;
const H = 480;

export function replay(frames: RawFrame[], params: GestureParams = config.gesture) {
  const smoother = new HandSmoother({ ...config.filter });
  const classifier = new GestureClassifier({ ...params });
  return frames.map((f) => classifier.step(smoother.smooth(toScreen(f, W, H))));
}

/** Discrete events as short strings; continuous ones (cursor, moves, progress) dropped, zoom runs collapsed. */
export function summarize(perFrame: GestureEvent[][]): string[] {
  const out: string[] = [];
  for (const e of perFrame.flat()) {
    let s: string | null = null;
    if (e.kind === 'pinchStart' || e.kind === 'pinchEnd') s = `${e.kind}:${e.hand}`;
    else if (e.kind === 'fire') s = `fire:${e.gesture}`;
    else if (e.kind === 'clutch' || e.kind === 'talk') s = `${e.kind}:${e.active ? 'on' : 'off'}`;
    else if (e.kind === 'handsLost') s = 'handsLost';
    else if (e.kind === 'twoHandZoom') s = out.at(-1) === 'zoom' ? null : 'zoom';
    if (s) out.push(s);
  }
  return out;
}
