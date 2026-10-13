// Pure gesture-study logic (docs/EVAL.md section 2): guided trials, a confusion
// matrix, and a false-trigger counter for the "talk with your hands" test.
import type { GestureEvent } from './types.ts';

export const STUDY_GESTURES = ['point', 'pinch', 'zoom', 'talk', 'undo', 'reset', 'clutch'] as const; // prettier-ignore
export type StudyGesture = (typeof STUDY_GESTURES)[number];
export type Outcome = StudyGesture | 'none';
export const OUTCOMES: readonly Outcome[] = [...STUDY_GESTURES, 'none'];

/** What the participant is asked to do. */
export const PROMPTS: Record<StudyGesture, string> = {
  point: 'Point with your index finger',
  pinch: 'Pinch and drag',
  zoom: 'Pinch with both hands and pull apart',
  talk: 'Hold a victory sign ✌',
  undo: 'Hold a thumb down 👎',
  reset: 'Hold an open palm ✋',
  clutch: 'Make a fist ✊',
};

/** The discrete outcome an event stands for (null: not decisive on its own). */
export function outcomeOf(e: GestureEvent): Outcome | null {
  switch (e.kind) {
    case 'pinchStart':
      return 'pinch';
    case 'twoHandZoom':
      return 'zoom';
    case 'talk':
      return e.active ? 'talk' : null;
    case 'clutch':
      return e.active ? 'clutch' : null;
    case 'fire':
      return e.gesture;
    default:
      return null;
  }
}

export interface Trial {
  participant: string;
  index: number;
  expected: StudyGesture;
  detected: Outcome;
  /** Prompt shown -> outcome (ms). */
  latencyMs: number;
}

export interface StudyTiming {
  /** Give up on a trial after this long (ms). */
  timeoutMs: number;
  /** Cursor-only for this long counts as "point" (ms). */
  pointHoldMs: number;
  /** Pause between trials (ms). */
  restMs: number;
}

/** Deterministic shuffle (mulberry32) so a session's order can be reproduced. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class GestureStudy {
  readonly trials: Trial[] = [];
  private readonly plan: StudyGesture[];
  private readonly participant: string;
  private readonly timing: StudyTiming;
  private next = 0;
  private startedAt = 0;
  private restUntil = 0;
  private cursorSince: number | null = null;
  active: StudyGesture | null = null;

  constructor(participant: string, triesPerGesture: number, seed: number, timing: StudyTiming) {
    this.participant = participant;
    this.timing = timing;
    const all = STUDY_GESTURES.flatMap((g) => Array<StudyGesture>(triesPerGesture).fill(g));
    this.plan = shuffled(all, seed);
  }

  get total(): number {
    return this.plan.length;
  }

  get done(): boolean {
    return this.trials.length === this.plan.length;
  }

  /** Feed every gesture event while the study runs. */
  onEvent(e: GestureEvent, now: number): void {
    if (!this.active) return;
    if (e.kind === 'cursor') {
      this.cursorSince ??= now;
      return;
    }
    if (e.kind === 'handsLost') this.cursorSince = null;
    const outcome = outcomeOf(e);
    if (outcome) this.finish(outcome, now);
  }

  /** Advance timers: call every frame (or at least every ~100 ms). */
  tick(now: number): void {
    if (this.done) return;
    if (!this.active) {
      if (now >= this.restUntil) this.begin(now);
      return;
    }
    if (this.cursorSince !== null && now - this.cursorSince >= this.timing.pointHoldMs) {
      // Only a cursor, long enough: that's a point (right or wrong, depending on the prompt).
      if (this.active === 'point') return this.finish('point', now);
    }
    if (now - this.startedAt >= this.timing.timeoutMs) {
      this.finish(this.cursorSince !== null ? 'point' : 'none', now);
    }
  }

  private begin(now: number): void {
    this.active = this.plan[this.next];
    this.startedAt = now;
    this.cursorSince = null;
  }

  private finish(detected: Outcome, now: number): void {
    if (!this.active) return;
    this.trials.push({
      participant: this.participant,
      index: this.next,
      expected: this.active,
      detected,
      latencyMs: Math.round(now - this.startedAt),
    });
    this.next++;
    this.active = null;
    this.restUntil = now + this.timing.restMs;
  }
}

/** counts[expected][detected]. */
export function confusionMatrix(
  trials: readonly Trial[],
): Record<StudyGesture, Record<Outcome, number>> {
  const m = Object.fromEntries(
    STUDY_GESTURES.map((g) => [g, Object.fromEntries(OUTCOMES.map((o) => [o, 0]))]),
  ) as Record<StudyGesture, Record<Outcome, number>>;
  for (const t of trials) m[t.expected][t.detected]++;
  return m;
}

export function confusionCsv(trials: readonly Trial[]): string {
  const m = confusionMatrix(trials);
  const rows = [['expected\\detected', ...OUTCOMES, 'accuracy'].join(',')];
  for (const g of STUDY_GESTURES) {
    const n = OUTCOMES.reduce((a, o) => a + m[g][o], 0);
    const acc = n ? (m[g][g] / n).toFixed(3) : '';
    rows.push([g, ...OUTCOMES.map((o) => m[g][o]), acc].join(','));
  }
  return rows.join('\n') + '\n';
}

export function trialsCsv(trials: readonly Trial[]): string {
  const rows = ['participant,index,expected,detected,correct,latency_ms'];
  for (const t of trials) {
    const who = `"${t.participant.replace(/"/g, '""')}"`;
    rows.push([who, t.index, t.expected, t.detected, t.expected === t.detected ? 1 : 0, t.latencyMs].join(',')); // prettier-ignore
  }
  return rows.join('\n') + '\n';
}

/** Counts unintended fire / talk / pinchStart events during free talking. */
export class FalseTriggerCounter {
  counts = { fire: 0, talk: 0, pinchStart: 0 };
  startedAt: number | null = null;

  start(now: number): void {
    this.counts = { fire: 0, talk: 0, pinchStart: 0 };
    this.startedAt = now;
  }

  onEvent(e: GestureEvent): void {
    if (this.startedAt === null) return;
    if (e.kind === 'fire') this.counts.fire++;
    else if (e.kind === 'talk' && e.active) this.counts.talk++;
    else if (e.kind === 'pinchStart') this.counts.pinchStart++;
  }

  stop(): void {
    this.startedAt = null;
  }

  /** Total triggers per 5 minutes (the EVAL.md target is < 1). */
  ratePer5Min(now: number): number {
    if (this.startedAt === null || now <= this.startedAt) return 0;
    const total = this.counts.fire + this.counts.talk + this.counts.pinchStart;
    return (total * 300_000) / (now - this.startedAt);
  }
}

/** What the study panel drives; the runtime feeds it gesture events and time. */
export class StudyHost {
  study: GestureStudy | null = null;
  readonly counter = new FalseTriggerCounter();

  begin(participant: string, tries: number, seed: number, timing: StudyTiming): void {
    this.study = new GestureStudy(participant, tries, seed, timing);
  }

  end(): void {
    this.study = null;
  }

  onEvent(e: GestureEvent, now: number): void {
    this.study?.onEvent(e, now);
    this.counter.onEvent(e);
  }

  tick(now: number): void {
    this.study?.tick(now);
  }
}
