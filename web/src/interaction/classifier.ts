// Pure gesture classifier: smoothed hand frames in, GestureEvents out.
// Combines MediaPipe's built-in labels (debounced) with a pinch rule
// (hysteresis + hold frames) and hold timers for reset / undo.
import type { config } from '../config.ts';
import type { HandsFrame, Vec2 } from '../tracking/geometry.ts';
import {
  dist,
  handScale,
  INDEX_TIP,
  MIDDLE_MCP,
  normalizedDistance,
  pinchDistance,
  pinchPoint,
  WRIST,
} from '../tracking/geometry.ts';
import type { GestureEvent, Hand, HoldGesture } from './types.ts';

export type GestureParams = typeof config.gesture;

/** A label that only changes after `need` consecutive identical samples. */
class Debounced {
  stable = 'None';
  private candidate = 'None';
  private count = 0;

  update(value: string, need: number): string {
    if (value === this.candidate) this.count++;
    else {
      this.candidate = value;
      this.count = 1;
    }
    if (this.count >= need) this.stable = value;
    return this.stable;
  }
}

interface HandState {
  label: Debounced;
  points: Vec2[];
  pinching: boolean;
  pinchFrames: number;
  missing: number;
  lastSeen: number;
}

interface Hold {
  gesture: HoldGesture;
  start: number;
  origin: Vec2;
  fired: boolean;
}

const HOLD_LABELS: [string, HoldGesture][] = [
  ['Open_Palm', 'reset'],
  ['Thumb_Down', 'undo'],
];

export class GestureClassifier {
  private readonly p: GestureParams;
  private readonly hands = new Map<Hand, HandState>();
  private clutch = false;
  private talk = false;
  private hold: Hold | null = null;
  private zoomDist: number | null = null;
  private lastHandsAt = -Infinity;
  private lostEmitted = true;

  /** params is read every frame, so debug-panel edits apply live. */
  constructor(params: GestureParams) {
    this.p = params;
  }

  step(frame: HandsFrame): GestureEvent[] {
    const { p } = this;
    const t = frame.t;
    const ev: GestureEvent[] = [];

    // Cursor from the primary (right, else first) hand.
    const primary = frame.hands.find((h) => h.hand === 'right') ?? frame.hands[0];
    if (primary) {
      const pinching = this.hands.get(primary.hand)?.pinching;
      const at = pinching ? pinchPoint(primary.points) : primary.points[INDEX_TIP];
      ev.push({ kind: 'cursor', x: at.x, y: at.y });
    }

    for (const h of frame.hands) {
      let s = this.hands.get(h.hand);
      if (!s) {
        s = { label: new Debounced(), points: h.points, pinching: false, pinchFrames: 0, missing: 0, lastSeen: t }; // prettier-ignore
        this.hands.set(h.hand, s);
      }
      s.points = h.points;
      s.missing = 0;
      s.lastSeen = t;
      const raw = h.gestureScore >= p.minGestureScore ? h.gesture : 'None';
      s.label.update(raw, p.labelStableFrames);

      const at = pinchPoint(h.points);
      const d = pinchDistance(h.points);
      if (!s.pinching) {
        const fistLike =
          raw === 'Closed_Fist' ||
          s.label.stable === 'Closed_Fist' ||
          normalizedDistance(h.points, WRIST, INDEX_TIP) < p.pinchMinIndexReach;
        s.pinchFrames = d < p.pinchEnter && !fistLike ? s.pinchFrames + 1 : 0;
        if (s.pinchFrames >= p.pinchStableFrames) {
          s.pinching = true;
          ev.push({ kind: 'pinchStart', hand: h.hand, x: at.x, y: at.y });
        }
      } else if (d > p.pinchExit) {
        this.endPinch(h.hand, s, ev);
      } else {
        ev.push({ kind: 'pinchMove', hand: h.hand, x: at.x, y: at.y });
      }
    }

    // Hands missing from this frame decay through the same debounce, so a
    // one-frame tracking dropout doesn't end a drag or push-to-talk.
    for (const [hand, s] of this.hands) {
      if (s.lastSeen === t) continue;
      s.missing++;
      s.label.update('None', p.labelStableFrames);
      if (s.pinching && s.missing >= p.pinchStableFrames) this.endPinch(hand, s, ev);
      if (t - s.lastSeen >= p.handsLostMs) this.hands.delete(hand);
    }

    // Two-hand zoom: ratio of pinch-point separation vs. previous frame.
    const pinchers = [...this.hands.values()].filter((s) => s.pinching && s.missing === 0);
    if (pinchers.length === 2) {
      const d = dist(pinchPoint(pinchers[0].points), pinchPoint(pinchers[1].points));
      if (this.zoomDist && d > 0) ev.push({ kind: 'twoHandZoom', scaleDelta: d / this.zoomDist });
      this.zoomDist = d;
    } else {
      this.zoomDist = null;
    }

    const labels = [...this.hands.values()].map((s) => s.label.stable);
    const clutch = labels.includes('Closed_Fist');
    if (clutch !== this.clutch) ev.push({ kind: 'clutch', active: (this.clutch = clutch) });
    const talk = labels.includes('Victory');
    if (talk !== this.talk) ev.push({ kind: 'talk', active: (this.talk = talk) });
    this.updateHold(t, ev);

    if (frame.hands.length > 0) {
      this.lastHandsAt = t;
      this.lostEmitted = false;
    } else if (!this.lostEmitted && t - this.lastHandsAt >= p.handsLostMs) {
      this.lostEmitted = true;
      ev.push({ kind: 'handsLost' });
    }
    return ev;
  }

  private endPinch(hand: Hand, s: HandState, ev: GestureEvent[]): void {
    s.pinching = false;
    s.pinchFrames = 0;
    const at = pinchPoint(s.points);
    ev.push({ kind: 'pinchEnd', hand, x: at.x, y: at.y });
  }

  private updateHold(t: number, ev: GestureEvent[]): void {
    let found: { gesture: HoldGesture; s: HandState } | null = null;
    for (const [label, gesture] of HOLD_LABELS) {
      const s = [...this.hands.values()].find((h) => h.label.stable === label);
      if (s) {
        found = { gesture, s };
        break;
      }
    }
    if (!found) {
      if (this.hold && !this.hold.fired) ev.push({ kind: 'holdProgress', gesture: this.hold.gesture, progress: 0 }); // prettier-ignore
      this.hold = null;
      return;
    }
    const origin = found.s.points[MIDDLE_MCP];
    const h = this.hold;
    if (!h || h.gesture !== found.gesture) {
      this.hold = { gesture: found.gesture, start: t, origin, fired: false };
    } else if (
      !h.fired &&
      dist(origin, h.origin) / handScale(found.s.points) > this.p.holdMaxDrift
    ) {
      h.start = t; // moved too much: the hold starts over
      h.origin = origin;
    }
    const hold = this.hold;
    if (!hold || hold.fired) return;
    const duration = hold.gesture === 'reset' ? this.p.resetHoldMs : this.p.undoHoldMs;
    const progress = Math.min(1, (t - hold.start) / duration);
    ev.push({ kind: 'holdProgress', gesture: hold.gesture, progress });
    if (progress >= 1) {
      hold.fired = true;
      ev.push({ kind: 'fire', gesture: hold.gesture });
    }
  }
}
