// Pure interaction state machine (docs/ARCHITECTURE.md transition table):
// (state, event) => [state, effects]. The runtime turns effects into camera,
// cursor and speech actions.
import type { GestureEvent, Hand } from './types.ts';

export type Mode =
  'idle' | 'pointing' | 'rotating' | 'zooming' | 'clutched' | 'listening' | 'circling';

export interface InteractionState {
  mode: Mode;
  /** Hands currently pinching, whatever the mode. */
  pinching: Hand[];
  /** Hand driving the rotation, and its last pinch point (px). */
  dragHand: Hand | null;
  last: { x: number; y: number } | null;
  /** Where listening returns to (idle when push-to-talk started without hands). */
  resume: 'idle' | 'pointing';
  /** Centre of the circle being drawn (screen px), while circling. */
  center: { x: number; y: number } | null;
}

export type Effect =
  | { kind: 'showCursor' }
  | { kind: 'hideCursor' }
  | { kind: 'moveCursor'; x: number; y: number }
  | { kind: 'beginDrag' }
  | { kind: 'rotate'; dx: number; dy: number }
  | { kind: 'release' }
  | { kind: 'beginZoom' }
  | { kind: 'dolly'; scale: number }
  | { kind: 'stopDrag' }
  | { kind: 'freeze' }
  | { kind: 'unfreeze' }
  /** x, y: where the pointing finger rests ("here"), when the hands started it. */
  | { kind: 'startListening'; x?: number; y?: number }
  | { kind: 'stopListening' }
  /** Warm the mic up (talk is likely) or drop the warm-up. */
  | { kind: 'primeListening'; active: boolean }
  /** Open palm held: camera home, filters cleared, replay stopped, selection dropped. */
  | { kind: 'startOver' }
  | { kind: 'switchScene'; direction: 'left' | 'right' }
  | { kind: 'explain' }
  | { kind: 'circleStart'; x: number; y: number }
  | { kind: 'circleRadius'; r: number }
  | { kind: 'circleEnd' }
  | { kind: 'circleCancel' };

export const initialState: InteractionState = {
  mode: 'idle',
  pinching: [],
  dragHand: null,
  last: null,
  resume: 'pointing',
  center: null,
};

type Result = [InteractionState, Effect[]];

export function reduce(s: InteractionState, e: GestureEvent): Result {
  // handsLost wins from any state.
  if (e.kind === 'handsLost') {
    const effects: Effect[] = [{ kind: 'hideCursor' }, { kind: 'stopDrag' }];
    if (s.mode === 'listening') effects.push({ kind: 'stopListening' });
    if (s.mode === 'circling') effects.push({ kind: 'circleCancel' });
    if (s.mode === 'clutched') effects.push({ kind: 'unfreeze' });
    return [{ ...initialState }, effects];
  }

  // Clutch freezes everything except listening.
  if (e.kind === 'clutch') {
    if (e.active && s.mode !== 'listening' && s.mode !== 'clutched') {
      return [{ ...s, mode: 'clutched', dragHand: null, last: null }, [{ kind: 'freeze' }]];
    }
    if (!e.active && s.mode === 'clutched') return [{ ...s, mode: 'pointing' }, [{ kind: 'unfreeze' }]]; // prettier-ignore
    return [s, []];
  }

  if (e.kind === 'talk') {
    if (e.active && (s.mode === 'pointing' || s.mode === 'idle')) {
      const at = e.x !== undefined && e.y !== undefined ? { x: e.x, y: e.y } : {};
      return [{ ...s, mode: 'listening', resume: s.mode === 'idle' ? 'idle' : 'pointing' }, [{ kind: 'startListening', ...at }]]; // prettier-ignore
    }
    if (!e.active && s.mode === 'listening') {
      return [{ ...s, mode: s.resume }, [{ kind: 'stopListening' }]];
    }
    return [s, []];
  }

  if (e.kind === 'talkPrime') {
    if (e.active && s.mode !== 'pointing' && s.mode !== 'idle') return [s, []];
    return [s, [{ kind: 'primeListening', active: e.active }]];
  }

  // A pinch held still turns the rotation into a circle selection centred there.
  if (e.kind === 'circleHold') {
    if (s.mode !== 'rotating' || e.hand !== s.dragHand) return [s, []];
    const center = { x: e.x, y: e.y };
    return [{ ...s, mode: 'circling', center, last: null }, [{ kind: 'stopDrag' }, { kind: 'circleStart', ...center }]]; // prettier-ignore
  }

  if (e.kind === 'cursor') {
    const move: Effect = { kind: 'moveCursor', x: e.x, y: e.y };
    if (s.mode === 'idle') return [{ ...s, mode: 'pointing' }, [{ kind: 'showCursor' }, move]];
    return [s, [move]];
  }

  if (e.kind === 'pinchStart') {
    const others = s.pinching.filter((h) => h !== e.hand);
    const pinching = [...others, e.hand];
    if ((s.mode === 'pointing' || s.mode === 'rotating') && others.length > 0) {
      return [{ ...s, pinching, mode: 'zooming', dragHand: null, last: null }, [{ kind: 'beginZoom' }]]; // prettier-ignore
    }
    if (s.mode === 'pointing') {
      return [
        { ...s, pinching, mode: 'rotating', dragHand: e.hand, last: { x: e.x, y: e.y } },
        [{ kind: 'beginDrag' }],
      ];
    }
    return [{ ...s, pinching }, []];
  }

  if (e.kind === 'pinchMove') {
    if (s.mode === 'circling' && e.hand === s.dragHand && s.center) {
      return [s, [{ kind: 'circleRadius', r: Math.hypot(e.x - s.center.x, e.y - s.center.y) }]];
    }
    if (s.mode === 'rotating' && e.hand === s.dragHand && s.last) {
      const effect: Effect = { kind: 'rotate', dx: e.x - s.last.x, dy: e.y - s.last.y };
      return [{ ...s, last: { x: e.x, y: e.y } }, [effect]];
    }
    return [s, []];
  }

  if (e.kind === 'pinchEnd') {
    const pinching = s.pinching.filter((h) => h !== e.hand);
    if (s.mode === 'rotating' && e.hand === s.dragHand) {
      return [{ ...s, pinching, mode: 'pointing', dragHand: null, last: null }, [{ kind: 'release' }]]; // prettier-ignore
    }
    if (s.mode === 'circling' && e.hand === s.dragHand) {
      return [{ ...s, pinching, mode: 'pointing', dragHand: null, center: null }, [{ kind: 'circleEnd' }]]; // prettier-ignore
    }
    if (s.mode === 'zooming') return [{ ...s, pinching, mode: 'pointing' }, []];
    return [{ ...s, pinching }, []];
  }

  if (e.kind === 'twoHandZoom') {
    return s.mode === 'zooming' ? [s, [{ kind: 'dolly', scale: e.scaleDelta }]] : [s, []];
  }

  if (e.kind === 'swipe' && (s.mode === 'pointing' || s.mode === 'idle')) {
    return [s, [{ kind: 'switchScene', direction: e.direction }]];
  }

  if (e.kind === 'fire' && s.mode === 'pointing') {
    if (e.gesture === 'reset') return [s, [{ kind: 'startOver' }]];
    if (e.gesture === 'explain') return [s, [{ kind: 'explain' }]];
  }

  return [s, []]; // holdProgress and anything not in the table
}
