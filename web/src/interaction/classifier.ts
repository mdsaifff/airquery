// Pure gesture classifier: smoothed hand frames in, GestureEvents out.
// Combines MediaPipe's built-in labels (debounced) with a pinch rule
// (hysteresis + hold frames), hold timers for reset / explain, two-hand talk and
// pinch-hold-to-circle.
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

const MIDDLE_TIP = 12;

/** Index finger out, middle finger curled: the hand is pointing (any orientation). */
export function isPointing(points: readonly Vec2[], p: GestureParams): boolean {
  return (
    normalizedDistance(points, WRIST, INDEX_TIP) > p.pinchMinIndexReach &&
    normalizedDistance(points, WRIST, MIDDLE_TIP) < p.pointMiddleMaxReach
  );
}

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
  /** Recent wrist positions for swipe detection. */
  trail: { t: number; x: number; y: number }[];
  pinching: boolean;
  pinchFrames: number;
  /** When and where the current pinch started, and whether it can still become a circle. */
  pinchAt: number;
  pinchOrigin: Vec2;
  /** The pinch point and time last frame, for its speed. */
  pinchLast: Vec2;
  pinchLastT: number;
  circleOpen: boolean;
  missing: number;
  lastSeen: number;
}

interface Hold {
  gesture: HoldGesture;
  start: number;
  origin: Vec2;
  fired: boolean;
}

export class GestureClassifier {
  private readonly p: GestureParams;
  private readonly hands = new Map<Hand, HandState>();
  private clutch = false;
  private talk = false;
  private hold: Hold | null = null;
  private zoomDist: number | null = null;
  private lastHandsAt = -Infinity;
  private lastSwipeAt = -Infinity;
  private lostEmitted = true;
  private lastPinchEndAt = -Infinity;

  /** params is read every frame, so debug-panel edits apply live. */
  constructor(params: GestureParams) {
    this.p = params;
  }

  step(frame: HandsFrame): GestureEvent[] {
    const { p } = this;
    const t = frame.t;
    const ev: GestureEvent[] = [];

    // Cursor from the pointing hand (the other one may be raised open to talk),
    // else a hand that isn't an open palm, else the right hand, else the first.
    const label = (h: { hand: Hand }) => this.hands.get(h.hand)?.label.stable ?? 'None';
    const primary =
      frame.hands.find((h) => isPointing(h.points, p)) ??
      (frame.hands.length > 1 ? frame.hands.find((h) => label(h) !== 'Open_Palm') : undefined) ??
      frame.hands.find((h) => h.hand === 'right') ??
      frame.hands[0];
    if (primary) {
      const pinching = this.hands.get(primary.hand)?.pinching;
      const at = pinching ? pinchPoint(primary.points) : primary.points[INDEX_TIP];
      ev.push({ kind: 'cursor', x: at.x, y: at.y });
    }

    for (const h of frame.hands) {
      let s = this.hands.get(h.hand);
      if (!s) {
        s = { label: new Debounced(), points: h.points, trail: [], pinching: false, pinchFrames: 0, pinchAt: t, pinchOrigin: h.points[INDEX_TIP], pinchLast: h.points[INDEX_TIP], pinchLastT: t, circleOpen: false, missing: 0, lastSeen: t }; // prettier-ignore
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
          [s.pinchAt, s.pinchOrigin, s.circleOpen] = [t, at, true];
          [s.pinchLast, s.pinchLastT] = [at, t];
          ev.push({ kind: 'pinchStart', hand: h.hand, x: at.x, y: at.y });
        }
      } else if (d > p.pinchExit) {
        this.endPinch(h.hand, s, ev, t);
      } else {
        ev.push({ kind: 'pinchMove', hand: h.hand, x: at.x, y: at.y });
        this.circleHold(h.hand, s, at, t, ev);
      }
      this.detectSwipe(s, raw, t, ev);
    }

    // Hands missing from this frame decay through the same debounce, so a
    // one-frame tracking dropout doesn't end a drag or push-to-talk.
    for (const [hand, s] of this.hands) {
      if (s.lastSeen === t) continue;
      s.missing++;
      s.label.update('None', p.labelStableFrames);
      if (s.pinching && s.missing >= p.pinchStableFrames) this.endPinch(hand, s, ev, t);
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
    this.updateTalk(ev);
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

  /** A fast sideways sweep of an open (not pinching, not fist) hand. */
  private detectSwipe(s: HandState, raw: string, t: number, ev: GestureEvent[]): void {
    const { p } = this;
    const wrist = s.points[WRIST];
    s.trail.push({ t, x: wrist.x, y: wrist.y });
    while (s.trail.length && t - s.trail[0].t > p.swipeWindowMs) s.trail.shift();
    if (s.pinching || raw === 'Closed_Fist' || t - this.lastSwipeAt < p.swipeCooldownMs) return;
    const first = s.trail[0];
    const dx = wrist.x - first.x;
    const dy = wrist.y - first.y;
    if (
      Math.abs(dx) > p.swipeMinHandScales * handScale(s.points) &&
      Math.abs(dx) > 2 * Math.abs(dy)
    ) {
      ev.push({ kind: 'swipe', direction: dx > 0 ? 'right' : 'left' });
      this.lastSwipeAt = t;
      s.trail.length = 0;
    }
  }

  /** Hands still tracked (a one-frame dropout still counts). */
  private liveHands(): HandState[] {
    return [...this.hands.values()].filter((s) => s.missing < this.p.pinchStableFrames);
  }

  /** Talk: one hand pointing while the other is raised open ("here" = the pointing fingertip). */
  private updateTalk(ev: GestureEvent[]): void {
    const live = this.liveHands();
    const open = live.filter((s) => s.label.stable === 'Open_Palm');
    const pointer = live.find((s) => !s.pinching && s.label.stable !== 'Open_Palm' && isPointing(s.points, this.p)); // prettier-ignore
    const raised = live.length === 2 && open.length === 1 && pointer !== undefined;
    if (raised === this.talk) return;
    this.talk = raised;
    const at = pointer?.points[INDEX_TIP];
    ev.push(raised && at ? { kind: 'talk', active: true, x: at.x, y: at.y } : { kind: 'talk', active: raised }); // prettier-ignore
  }

  /** A pinch held still (before it starts rotating) becomes the centre of a circle selection. */
  private circleHold(hand: Hand, s: HandState, at: Vec2, t: number, ev: GestureEvent[]): void {
    if (!s.circleOpen) return;
    const scale = handScale(s.points);
    const speed = (dist(at, s.pinchLast) / scale) * (1000 / Math.max(1, t - s.pinchLastT));
    [s.pinchLast, s.pinchLastT] = [at, t];
    const dragging = t - s.pinchAt > this.p.circleSettleMs && speed > this.p.circleMaxSpeed;
    if (dist(at, s.pinchOrigin) / scale > this.p.circleMaxDrift || dragging) {
      s.circleOpen = false; // it moved: a rotation, not a circle
      ev.push({ kind: 'holdProgress', gesture: 'circle', progress: 0 });
      return;
    }
    const progress = Math.min(1, (t - s.pinchAt) / this.p.circleHoldMs);
    ev.push({ kind: 'holdProgress', gesture: 'circle', progress });
    if (progress < 1) return;
    s.circleOpen = false;
    ev.push({ kind: 'circleHold', hand, x: s.pinchOrigin.x, y: s.pinchOrigin.y });
  }

  private endPinch(hand: Hand, s: HandState, ev: GestureEvent[], t: number): void {
    this.lastPinchEndAt = t;
    s.pinching = false;
    s.pinchFrames = 0;
    const at = pinchPoint(s.points);
    ev.push({ kind: 'pinchEnd', hand, x: at.x, y: at.y });
  }

  private updateHold(t: number, ev: GestureEvent[]): void {
    let found: { gesture: HoldGesture; s: HandState } | null = null;
    const holdLabels: [string, HoldGesture][] = [
      ['Open_Palm', 'reset'],
      [this.p.customExplainLabel, 'explain'],
    ];
    const justReleased = t - this.lastPinchEndAt < this.p.resetAfterPinchMs;
    // With two hands up, an open palm means "talk", never "start over".
    const oneHand = this.liveHands().length === 1;
    for (const [label, gesture] of holdLabels) {
      if (gesture === 'reset' && (justReleased || !oneHand)) continue; // relaxing or talking
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
    const duration = hold.gesture === 'reset' ? this.p.resetHoldMs : this.p.explainHoldMs;
    const progress = Math.min(1, (t - hold.start) / duration);
    ev.push({ kind: 'holdProgress', gesture: hold.gesture, progress });
    if (progress >= 1) {
      hold.fired = true;
      ev.push({ kind: 'fire', gesture: hold.gesture });
    }
  }
}
