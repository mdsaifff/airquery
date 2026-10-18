import { describe, expect, it } from 'vitest';
import { initialState, reduce } from './stateMachine.ts';
import type { Effect, InteractionState, Mode } from './stateMachine.ts';
import type { GestureEvent } from './types.ts';

const st = (mode: Mode, extra: Partial<InteractionState> = {}): InteractionState => ({
  ...initialState,
  mode,
  ...extra,
});
const rotating = st('rotating', {
  pinching: ['right'],
  dragHand: 'right',
  last: { x: 100, y: 100 },
});
const zooming = st('zooming', { pinching: ['right', 'left'] });
const circling = st('circling', {
  pinching: ['right'],
  dragHand: 'right',
  center: { x: 100, y: 100 },
});

interface Row {
  row: string;
  from: InteractionState;
  event: GestureEvent;
  to: Mode;
  effects: Effect['kind'][];
}

// One entry per row of the ARCHITECTURE.md table (plus the "any"/"pointing / rotating" expansions).
const TABLE: Row[] = [
  { row: 'idle + cursor', from: st('idle'), event: { kind: 'cursor', x: 1, y: 2 }, to: 'pointing', effects: ['showCursor', 'moveCursor'] },
  { row: 'pointing + pinchStart (one hand)', from: st('pointing'), event: { kind: 'pinchStart', hand: 'right', x: 100, y: 100 }, to: 'rotating', effects: ['beginDrag'] },
  { row: 'rotating + pinchMove', from: rotating, event: { kind: 'pinchMove', hand: 'right', x: 110, y: 95 }, to: 'rotating', effects: ['rotate'] },
  { row: 'rotating + pinchEnd', from: rotating, event: { kind: 'pinchEnd', hand: 'right', x: 0, y: 0 }, to: 'pointing', effects: ['release'] },
  { row: 'pointing + second hand pinches', from: st('pointing', { pinching: ['right'] }), event: { kind: 'pinchStart', hand: 'left', x: 0, y: 0 }, to: 'zooming', effects: ['beginZoom'] },
  { row: 'rotating + second hand pinches', from: rotating, event: { kind: 'pinchStart', hand: 'left', x: 0, y: 0 }, to: 'zooming', effects: ['beginZoom'] },
  { row: 'zooming + twoHandZoom', from: zooming, event: { kind: 'twoHandZoom', scaleDelta: 1.1 }, to: 'zooming', effects: ['dolly'] },
  { row: 'zooming + right pinch ends', from: zooming, event: { kind: 'pinchEnd', hand: 'right', x: 0, y: 0 }, to: 'pointing', effects: [] },
  { row: 'zooming + left pinch ends', from: zooming, event: { kind: 'pinchEnd', hand: 'left', x: 0, y: 0 }, to: 'pointing', effects: [] },
  ...(['idle', 'pointing', 'rotating', 'zooming'] as const).map((m): Row => ({
    row: `${m} + clutch active`, from: m === 'rotating' ? rotating : m === 'zooming' ? zooming : st(m), event: { kind: 'clutch', active: true }, to: 'clutched', effects: ['freeze'],
  })),
  { row: 'listening + clutch active (excluded)', from: st('listening'), event: { kind: 'clutch', active: true }, to: 'listening', effects: [] },
  { row: 'clutched + clutch inactive', from: st('clutched'), event: { kind: 'clutch', active: false }, to: 'pointing', effects: ['unfreeze'] },
  { row: 'pointing + talk active', from: st('pointing'), event: { kind: 'talk', active: true }, to: 'listening', effects: ['startListening'] },
  { row: 'idle + talk active', from: st('idle'), event: { kind: 'talk', active: true }, to: 'listening', effects: ['startListening'] },
  { row: 'listening + talk inactive', from: st('listening', { resume: 'pointing' }), event: { kind: 'talk', active: false }, to: 'pointing', effects: ['stopListening'] },
  { row: 'pointing + fire reset (start over)', from: st('pointing'), event: { kind: 'fire', gesture: 'reset' }, to: 'pointing', effects: ['startOver'] },
  { row: 'pointing + fire explain (custom gesture)', from: st('pointing'), event: { kind: 'fire', gesture: 'explain' }, to: 'pointing', effects: ['explain'] },
  { row: 'rotating + circleHold (still pinch)', from: rotating, event: { kind: 'circleHold', hand: 'right', x: 100, y: 100 }, to: 'circling', effects: ['stopDrag', 'circleStart'] },
  { row: 'circling + pinchMove', from: circling, event: { kind: 'pinchMove', hand: 'right', x: 130, y: 140 }, to: 'circling', effects: ['circleRadius'] },
  { row: 'circling + pinchEnd', from: circling, event: { kind: 'pinchEnd', hand: 'right', x: 0, y: 0 }, to: 'pointing', effects: ['circleEnd'] },
  { row: 'circling + handsLost', from: circling, event: { kind: 'handsLost' }, to: 'idle', effects: ['hideCursor', 'stopDrag', 'circleCancel'] },
  ...(['idle', 'pointing', 'rotating', 'zooming'] as const).map((m): Row => ({
    row: `${m} + handsLost`, from: m === 'rotating' ? rotating : st(m), event: { kind: 'handsLost' }, to: 'idle', effects: ['hideCursor', 'stopDrag'],
  })),
  { row: 'clutched + handsLost', from: st('clutched'), event: { kind: 'handsLost' }, to: 'idle', effects: ['hideCursor', 'stopDrag', 'unfreeze'] },
  { row: 'listening + handsLost', from: st('listening'), event: { kind: 'handsLost' }, to: 'idle', effects: ['hideCursor', 'stopDrag', 'stopListening'] },
]; // prettier-ignore

describe('interaction state machine: transition table', () => {
  it.each(TABLE)('$row -> $to', ({ from, event, to, effects }) => {
    const [next, fx] = reduce(from, event);
    expect(next.mode).toBe(to);
    expect(fx.map((f) => f.kind)).toEqual(effects);
  });
});

describe('interaction state machine: details', () => {
  it('rotate deltas are relative to the previous pinch point', () => {
    const [s1, fx1] = reduce(rotating, { kind: 'pinchMove', hand: 'right', x: 110, y: 95 });
    expect(fx1).toEqual([{ kind: 'rotate', dx: 10, dy: -5 }]);
    const [, fx2] = reduce(s1, { kind: 'pinchMove', hand: 'right', x: 115, y: 95 });
    expect(fx2).toEqual([{ kind: 'rotate', dx: 5, dy: 0 }]);
  });

  it('ignores the non-dragging hand while rotating', () => {
    expect(reduce(rotating, { kind: 'pinchMove', hand: 'left', x: 0, y: 0 })[1]).toEqual([]);
  });

  it('ignores gestures that the table does not allow in a state', () => {
    for (const [mode, event] of [
      ['rotating', { kind: 'fire', gesture: 'reset' }],
      ['listening', { kind: 'fire', gesture: 'reset' }],
      ['pointing', { kind: 'circleHold', hand: 'right', x: 0, y: 0 }],
      ['rotating', { kind: 'talk', active: true }],
      ['clutched', { kind: 'pinchStart', hand: 'right', x: 0, y: 0 }],
      ['pointing', { kind: 'twoHandZoom', scaleDelta: 2 }],
    ] as [Mode, GestureEvent][]) {
      const [next, fx] = reduce(st(mode), event);
      expect(next.mode, `${mode} + ${event.kind}`).toBe(mode);
      expect(fx).toEqual([]);
    }
  });

  it('talk carries where the finger rests; the circle radius is the distance from its centre', () => {
    expect(reduce(st('pointing'), { kind: 'talk', active: true, x: 40, y: 50 })[1]).toEqual([
      { kind: 'startListening', x: 40, y: 50 },
    ]);
    expect(reduce(circling, { kind: 'pinchMove', hand: 'right', x: 130, y: 140 })[1]).toEqual([
      { kind: 'circleRadius', r: 50 },
    ]);
  });

  it('push-to-talk started without hands returns to idle', () => {
    const [s1] = reduce(initialState, { kind: 'talk', active: true });
    expect(reduce(s1, { kind: 'talk', active: false })[0].mode).toBe('idle');
  });

  it('a pinch held during clutch becomes the first pinch of a later zoom', () => {
    let [s] = reduce(st('clutched'), { kind: 'pinchStart', hand: 'right', x: 0, y: 0 });
    [s] = reduce(s, { kind: 'clutch', active: false });
    const [next, fx] = reduce(s, { kind: 'pinchStart', hand: 'left', x: 0, y: 0 });
    expect(next.mode).toBe('zooming');
    expect(fx).toEqual([{ kind: 'beginZoom' }]);
  });

  it('moves the cursor in every non-idle state', () => {
    for (const mode of ['pointing', 'rotating', 'zooming', 'clutched', 'listening'] as Mode[]) {
      expect(reduce(st(mode), { kind: 'cursor', x: 3, y: 4 })[1]).toEqual([
        { kind: 'moveCursor', x: 3, y: 4 },
      ]);
    }
  });
});
