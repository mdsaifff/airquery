// Per-stage timings in fixed-size ring buffers. Loops write; the HUD and the
// latency report read medians and percentiles.

export class RingBuffer {
  private readonly data: Float64Array;
  private next = 0;
  private size = 0;

  constructor(capacity: number) {
    this.data = new Float64Array(capacity);
  }

  push(value: number): void {
    this.data[this.next] = value;
    this.next = (this.next + 1) % this.data.length;
    this.size = Math.min(this.size + 1, this.data.length);
  }

  get count(): number {
    return this.size;
  }

  /** Most recent value, or NaN when empty. */
  get last(): number {
    return this.size ? this.data[(this.next - 1 + this.data.length) % this.data.length] : NaN;
  }

  /** p in 0..1 (nearest-rank); NaN when empty. */
  percentile(p: number): number {
    if (!this.size) return NaN;
    const sorted = this.data.slice(0, this.size).sort();
    return sorted[Math.min(this.size - 1, Math.max(0, Math.ceil(p * this.size) - 1))];
  }

  values(): number[] {
    return Array.from(this.data.slice(0, this.size));
  }
}

export type Stage =
  | 'frame' // render loop CPU per frame (ms)
  | 'inference' // MediaPipe per tracking frame (ms)
  | 'gestures' // smoothing + classifier + state machine per tracking frame (ms)
  | 'stt' // push-to-talk released -> final transcript (ms)
  | 'agent' // browser-side /query round trip incl. network (ms)
  | 'query' // DuckDB per query (ms)
  | 'voiceToRender'; // end of speech -> first changed frame (ms)

const CAPACITY = 600;

export const metrics: Record<Stage, RingBuffer> = {
  frame: new RingBuffer(CAPACITY),
  inference: new RingBuffer(CAPACITY),
  gestures: new RingBuffer(CAPACITY),
  stt: new RingBuffer(CAPACITY),
  agent: new RingBuffer(CAPACITY),
  query: new RingBuffer(CAPACITY),
  voiceToRender: new RingBuffer(CAPACITY),
};

/** Everything the latency report needs, as a JSON-able object. */
export function exportMetrics(userAgent: string): Record<string, unknown> {
  const stages: Record<string, number[]> = {};
  for (const [stage, buf] of Object.entries(metrics)) stages[stage] = buf.values();
  return { exportedAt: new Date().toISOString(), userAgent, stages };
}

/** Median and p90 per stage, rounded to 0.1 ms (for the HUD and exports). */
export function summarizeMetrics(): Record<Stage, { n: number; p50: number; p90: number }> {
  const out = {} as Record<Stage, { n: number; p50: number; p90: number }>;
  for (const [stage, buf] of Object.entries(metrics) as [Stage, RingBuffer][]) {
    const r = (v: number) => Math.round(v * 10) / 10;
    out[stage] = { n: buf.count, p50: r(buf.percentile(0.5)), p90: r(buf.percentile(0.9)) };
  }
  return out;
}
