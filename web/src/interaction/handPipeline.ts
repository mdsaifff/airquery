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
import type { GestureEvent, HoldGesture } from './types.ts';

export class HandPipeline {
  state: InteractionState = initialState;
  /** Latest hold timer, for the HUD ring (null when no hold is timing). */
  hold: { gesture: HoldGesture; progress: number } | null = null;
  private readonly smoother = new HandSmoother(config.filter);
  private readonly classifier = new GestureClassifier(config.gesture);
  private readonly targets: EffectTargets;

  constructor(targets: EffectTargets) {
    this.targets = targets;
  }

  onFrame(frame: RawFrame, width: number, height: number): void {
    const t0 = performance.now();
    const hands = this.smoother.smooth(toScreen(frame, width, height));
    for (const e of this.classifier.step(hands)) this.dispatch(e);
    metrics.gestures.push(performance.now() - t0);
  }

  dispatch(e: GestureEvent): void {
    if (e.kind === 'holdProgress') {
      this.hold = e.progress > 0 && e.progress < 1 ? { gesture: e.gesture, progress: e.progress } : null; // prettier-ignore
    }
    const [next, effects] = reduce(this.state, e);
    this.state = next;
    applyEffects(effects, this.targets, performance.now());
  }
}
