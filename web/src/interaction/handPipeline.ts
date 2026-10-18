// Raw tracking frames -> screen space -> smoothing -> gestures -> state machine
// -> effects. Keyboard fallbacks dispatch into the same state machine.
import { config } from '../config.ts';
import { metrics } from '../hud/metrics.ts';
import { toScreen } from '../tracking/geometry.ts';
import { HandSmoother } from '../tracking/handSmoother.ts';
import type { RawFrame } from '../tracking/rawFrame.ts';
import { GestureClassifier } from './classifier.ts';
import { applyEffects } from './effects.ts';
import type { EffectTargets } from './effects.ts';
import { initialState, reduce } from './stateMachine.ts';
import type { InteractionState } from './stateMachine.ts';
import type { GestureEvent, Hand, HoldGesture } from './types.ts';

/** Effect targets, plus the HUD: a pinch that lands on a HUD control (a scene name) presses it. */
export interface PipelineTargets extends EffectTargets {
  /** Called on every pinch start (screen px); true = it pressed a control, so the globe ignores this pinch. */
  uiPress?(x: number, y: number): boolean;
}

export class HandPipeline {
  state: InteractionState = initialState;
  /** Latest hold timer, for the HUD ring (null when no hold is timing). */
  hold: { gesture: HoldGesture; progress: number } | null = null;
  /** Taps on every gesture event (gesture study, false-trigger counter). */
  readonly listeners: ((e: GestureEvent) => void)[] = [];
  private readonly smoother = new HandSmoother(config.filter);
  private readonly classifier = new GestureClassifier(config.gesture);
  private readonly targets: PipelineTargets;
  /** Hands whose current pinch pressed a HUD control. */
  private readonly pressed = new Set<Hand>();

  constructor(targets: PipelineTargets) {
    this.targets = targets;
  }

  onFrame(frame: RawFrame, width: number, height: number): void {
    const t0 = performance.now();
    const hands = this.smoother.smooth(toScreen(frame, width, height));
    for (const e of this.classifier.step(hands)) this.dispatch(e);
    metrics.gestures.push(performance.now() - t0);
  }

  dispatch(e: GestureEvent): void {
    for (const listen of this.listeners) listen(e);
    if (this.pressedHud(e)) return;
    if (e.kind === 'holdProgress') {
      this.hold = e.progress > 0 && e.progress < 1 ? { gesture: e.gesture, progress: e.progress } : null; // prettier-ignore
    }
    const [next, effects] = reduce(this.state, e);
    this.state = next;
    applyEffects(effects, this.targets, performance.now());
  }

  /** A pinch on a HUD control is a press: the globe never sees its start, moves, circle or end. */
  private pressedHud(e: GestureEvent): boolean {
    if (e.kind === 'pinchStart' && this.targets.uiPress?.(e.x, e.y))
      return !!this.pressed.add(e.hand);
    if (e.kind === 'pinchMove' || e.kind === 'circleHold') return this.pressed.has(e.hand);
    if (e.kind === 'pinchEnd') return this.pressed.delete(e.hand);
    return e.kind === 'holdProgress' && e.gesture === 'circle' && this.pressed.size > 0;
  }
}
