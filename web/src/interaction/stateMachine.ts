// Pure interaction state machine (docs/ARCHITECTURE.md transition table):
// (state, event) => [state, effects]. The runtime turns effects into camera,
// cursor and speech actions.
import type { GestureEvent, Hand } from './types.ts';

export type Mode =
  'idle' | 'pointing' | 'rotating' | 'zooming' | 'clutched' | 'listening' | 'lassoing';

export interface InteractionState {
  mode: Mode;
  /** Hands currently pinching, whatever the mode. */
  pinching: Hand[];
  /** Hand driving the rotation, and its last pinch point (px). */
  dragHand: Hand | null;
  last: { x: number; y: number } | null;
  /** Where listening returns to (idle when push-to-talk started without hands). */
  resume: 'idle' | 'pointing';
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
  | { kind: 'startListening' }
  | { kind: 'stopListening' }
  | { kind: 'resetView' }
  | { kind: 'undo' }
  | { kind: 'switchScene'; direction: 'left' | 'right' }
  | { kind: 'lassoStart' }
  | { kind: 'lassoPoint'; x: number; y: number }
  | { kind: 'lassoEnd' }
  | { kind: 'lassoCancel' };

export const initialState: InteractionState = {
  mode: 'idle',
  pinching: [],
  dragHand: null,
  last: null,
  resume: 'pointing',
};

type Result = [InteractionState, Effect[]];

export function reduce(s: InteractionState, e: GestureEvent): Result {
  // handsLost wins from any state.
  if (e.kind === 'handsLost') {
    const effects: Effect[] = [{ kind: 'hideCursor' }, { kind: 'stopDrag' }];
    if (s.mode === 'listening') effects.push({ kind: 'stopListening' });
    if (s.mode === 'lassoing') effects.push({ kind: 'lassoCancel' });
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
      return [{ ...s, mode: 'listening', resume: s.mode === 'idle' ? 'idle' : 'pointing' }, [{ kind: 'startListening' }]]; // prettier-ignore
    }
    if (!e.active && s.mode === 'listening') {
      return [{ ...s, mode: s.resume }, [{ kind: 'stopListening' }]];
    }
    return [s, []];
  }

  if (e.kind === 'lasso') {
    if (e.active && s.mode === 'pointing') return [{ ...s, mode: 'lassoing' }, [{ kind: 'lassoStart' }]]; // prettier-ignore
    if (!e.active && s.mode === 'lassoing') return [{ ...s, mode: 'pointing' }, [{ kind: 'lassoEnd' }]]; // prettier-ignore
    return [s, []];
  }

  if (e.kind === 'cursor') {
    const move: Effect = { kind: 'moveCursor', x: e.x, y: e.y };
    if (s.mode === 'idle') return [{ ...s, mode: 'pointing' }, [{ kind: 'showCursor' }, move]];
    if (s.mode === 'lassoing') return [s, [move, { kind: 'lassoPoint', x: e.x, y: e.y }]];
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
    return [s, [{ kind: e.gesture === 'reset' ? 'resetView' : 'undo' }]];
  }

  return [s, []]; // holdProgress and anything not in the table
}
