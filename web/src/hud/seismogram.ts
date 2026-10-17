// Pure: the year as a seismogram strip. Each pixel column holds the strongest
// visible event in its time slice (and the strongest hidden one, drawn faint).

export interface Strip {
  /** Amplitude 0..1 of the strongest visible event per column (0 = none). */
  shown: Float32Array;
  /** Row index of that event (for its colour), -1 when none. */
  shownRow: Int32Array;
  /** Amplitude 0..1 of the strongest filtered-out event per column. */
  hidden: Float32Array;
}

/** Smallest spike, so every event leaves a mark (0..1 of the half-height). */
export const MIN_AMP = 0.1;

export function timeRange(times: ArrayLike<number>): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (Number.isFinite(t)) [lo, hi] = [Math.min(lo, t), Math.max(hi, t)];
  }
  return [lo, hi];
}

export function binStrip(
  times: ArrayLike<number>,
  weights: ArrayLike<number> | null,
  visible: ArrayLike<number>,
  width: number,
): Strip {
  const strip: Strip = {
    shown: new Float32Array(width),
    shownRow: new Int32Array(width).fill(-1),
    hidden: new Float32Array(width),
  };
  const [t0, t1] = timeRange(times);
  if (!(t1 >= t0) || width < 1) return strip;
  const [w0, w1] = weights ? timeRange(weights) : [0, 0];
  const wSpan = w1 - w0 || 1;
  const tSpan = t1 - t0 || 1;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (!Number.isFinite(t)) continue;
    const x = Math.min(width - 1, Math.floor(((t - t0) / tSpan) * width));
    const w = weights ? Math.min(1, Math.max(0, (weights[i] - w0) / wSpan)) : 0.4;
    const amp = MIN_AMP + (1 - MIN_AMP) * w ** 3; // cubed: big events tower over the rest
    if (visible[i]) {
      if (amp > strip.shown[x]) [strip.shown[x], strip.shownRow[x]] = [amp, i];
    } else if (amp > strip.hidden[x]) strip.hidden[x] = amp;
  }
  return strip;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Axis labels as fractions 0..1 of the strip: months for spans up to ~13 months, else years. */
export function timeTicks(t0: number, t1: number): { at: number; label: string }[] {
  if (!(t1 > t0)) return [];
  const span = t1 - t0;
  const ticks: { at: number; label: string }[] = [];
  const d = new Date(t0);
  const months = span <= 400 * 86_400_000;
  let y = d.getUTCFullYear();
  let m = months ? d.getUTCMonth() : 0;
  for (;;) {
    const t = Date.UTC(y, m, 1);
    if (t > t1) break;
    if (t >= t0) ticks.push({ at: (t - t0) / span, label: months ? MONTHS[m] : String(y) });
    if (months) [y, m] = m === 11 ? [y + 1, 0] : [y, m + 1];
    else y++;
  }
  return ticks;
}
