import { describe, expect, it } from 'vitest';
import { listFixtures, loadExpected, loadFixture } from '../../tests/fixtures.ts';
import { replay, summarize } from '../../tests/replay.ts';
import { synthFrames, synthHand } from '../../tests/synthHand.ts';
import type { SynthOptions } from '../../tests/synthHand.ts';
import type { RawHand } from '../tracking/rawFrame.ts';
import type { GestureEvent } from './types.ts';

const right = (o: SynthOptions = {}): RawHand => synthHand({ handedness: 'Left', ...o });
const left = (o: SynthOptions = {}): RawHand => synthHand({ handedness: 'Right', cx: 0.7, ...o });
const run = (count: number, at: (i: number) => RawHand[]) => summarize(replay(synthFrames(count, at))); // prettier-ignore
const NO_FALSE_TRIGGERS = /^(fire|talk|pinchStart)/;

describe('GestureClassifier (synthetic hands)', () => {
  it('point: cursor follows the index tip, no discrete events', () => {
    const frames = synthFrames(30, (i) => [
      right({ pose: 'point', gesture: 'Pointing_Up', cx: 0.6 - i * 0.005 }),
    ]);
    const events = replay(frames);
    expect(summarize(events)).toEqual([]);
    const xs = events.map((e) => e.find((x) => x.kind === 'cursor')).map((c) => c && 'x' in c && c.x); // prettier-ignore
    expect(xs.every((x) => typeof x === 'number')).toBe(true);
    expect(Number(xs.at(-1))).toBeGreaterThan(Number(xs[0])); // raw x falls -> screen x rises
  });

  it('pinch: one start, one end (held still long enough, it also becomes a circle)', () => {
    expect(run(70, (i) => [right({ pinch: i >= 15 && i < 60 ? 1 : 0 })])).toEqual([
      'pinchStart:right',
      'circle:right',
      'pinchEnd:right',
    ]);
  });

  it('pinch-drag: moves report the travelling pinch point', () => {
    const frames = synthFrames(40, (i) => [right({ pinch: 1, cx: 0.6 - i * 0.004 })]);
    const moves = replay(frames)
      .flat()
      .filter((e): e is Extract<GestureEvent, { hand: unknown }> => e.kind === 'pinchMove');
    expect(moves.length).toBeGreaterThan(30);
    expect((moves.at(-1)?.x ?? 0) - moves[0].x).toBeGreaterThan(50);
  });

  it('hysteresis: hovering between enter and exit does not toggle', () => {
    // pinch 0.45 → distance ≈ 0.63 (above exit), 0.8 → 0.23 (below enter), 0.62 → 0.43 (between)
    const seq = run(90, (i) => [
      right({ pinch: i < 10 ? 0.45 : i < 30 ? 0.8 : i % 2 ? 0.62 : 0.6 }),
    ]);
    expect(seq).toEqual(['pinchStart:right', 'circle:right']);
  });

  it('two-hand pinch pulled apart: zoom with growing scale', () => {
    const frames = synthFrames(40, (i) => {
      const spread = i < 10 ? 0 : (i - 10) * 0.004;
      return [right({ pinch: 1, cx: 0.4 - spread }), left({ pinch: 1, cx: 0.6 + spread })];
    });
    const events = replay(frames);
    const seq = summarize(events);
    expect(seq.filter((s) => s.startsWith('pinchStart')).sort()).toEqual([
      'pinchStart:left',
      'pinchStart:right',
    ]);
    expect(seq).toContain('zoom');
    const total = events
      .flat()
      .reduce((acc, e) => (e.kind === 'twoHandZoom' ? acc * e.scaleDelta : acc), 1);
    expect(total).toBeGreaterThan(1.5);
  });

  it('fist: clutch on/off and never a pinch, even though thumb and index meet', () => {
    const seq = run(50, (i) =>
      i < 30 ? [right({ pose: 'fist', gesture: 'Closed_Fist' })] : [right()],
    );
    expect(seq).toEqual(['clutch:on', 'clutch:off']);
  });

  it('fist before the label catches up: index reach still blocks the pinch', () => {
    expect(run(20, () => [right({ pose: 'fist', gesture: 'None' })])).toEqual([]);
  });

  it('open palm held still: one reset, no repeat while held', () => {
    expect(run(60, () => [right({ gesture: 'Open_Palm' })])).toEqual(['fire:reset']);
  });

  it('opening the hand right after a pinch does not reset the view', () => {
    // Pinch, then the hand relaxes into an open palm held still for 2 s.
    const seq = run(80, (i) => [right(i < 20 ? { pinch: 1 } : { gesture: 'Open_Palm' })]);
    expect(seq.filter((x) => x.startsWith('fire'))).toEqual([]);
  });

  it('open palm while moving: no reset', () => {
    expect(run(60, (i) => [right({ gesture: 'Open_Palm', cx: 0.3 + i * 0.006 })])).toEqual([]);
  });

  it('open palm released early: progress resets to 0', () => {
    const events = replay(synthFrames(20, (i) => [right({ gesture: i < 12 ? 'Open_Palm' : 'None' })])); // prettier-ignore
    const progress = events.flat().filter((e) => e.kind === 'holdProgress');
    expect(progress.at(-1)).toEqual({ kind: 'holdProgress', gesture: 'reset', progress: 0 });
    expect(summarize(events)).toEqual([]);
  });

  it('thumb down, victory and 🤟 no longer do anything (undo is spoken; talk is the other hand)', () => {
    expect(run(30, () => [right({ pose: 'thumbDown', gesture: 'Thumb_Down' })])).toEqual([]);
    expect(run(40, () => [right({ pose: 'victory', gesture: 'Victory' })])).toEqual([]);
    expect(run(30, () => [right({ gesture: 'ILoveYou' })])).toEqual([]);
  });

  it('point with one hand, raise the other open: talk while it is up', () => {
    const events = replay(
      synthFrames(40, (i) =>
        i >= 5 && i < 25
          ? [right({ pose: 'point', cx: 0.4 }), left({ gesture: 'Open_Palm' })]
          : [right({ pose: 'point', cx: 0.4 })],
      ),
    );
    expect(summarize(events)).toEqual(['talk:on', 'talk:off']);
    const flat = events.flat();
    const on = flat.find((e) => e.kind === 'talk' && e.active);
    const cursor = flat.filter((e) => e.kind === 'cursor').at(-1);
    // "here" = the pointing fingertip, and the cursor stays on the pointing hand
    const onAt = on?.kind === 'talk' ? [on.x ?? NaN, on.y ?? NaN] : [NaN, NaN];
    const cur = cursor?.kind === 'cursor' ? [cursor.x, cursor.y] : [NaN, NaN];
    expect(Math.hypot(onAt[0] - cur[0], onAt[1] - cur[1])).toBeLessThan(3);
  });

  it('with two hands up, an open palm never starts over', () => {
    expect(run(60, () => [right({ pose: 'point' }), left({ gesture: 'Open_Palm' })])).toEqual([
      'talk:on',
    ]);
  });

  it('holding a pointing finger still never opens the microphone (talk = raise the other hand)', () => {
    expect(run(150, () => [right({ pose: 'point', cx: 0.4 })])).toEqual([]); // 5 s still
  });

  it('pinch held still: one circle at the pinch point; a moving pinch rotates, no circle', () => {
    expect(run(60, () => [right({ pinch: 1 })])).toEqual(['pinchStart:right', 'circle:right']);
    expect(run(40, (i) => [right({ pinch: 1, cx: 0.6 - i * 0.004 })])).toEqual(['pinchStart:right']); // prettier-ignore
  });

  it('pinch, a natural pause before dragging, then a drag: a rotation, not a circle', () => {
    // Seen live: the half-second settle before a drag passed the hold and the drag sized a circle
    const pauseThenDrag = (i: number) => [right({ pinch: 1, cx: i < 24 ? 0.6 : 0.6 - (i - 24) * 0.004 })]; // prettier-ignore
    expect(run(60, pauseThenDrag)).toEqual(['pinchStart:right']);
  });

  it('a hand settling as the pinch closes, then held still: still a circle', () => {
    const settle = (i: number) => [right({ pinch: 1, cx: 0.6 - Math.min(i, 6) * 0.004 })];
    expect(run(60, settle)).toEqual(['pinchStart:right', 'circle:right']);
  });

  it('the circle ring stays hidden through a short pause, so a drag never shows it loading', () => {
    const frames = synthFrames(18, () => [right({ pinch: 1 })]); // ~0.55 s held still
    const shown = replay(frames)
      .flat()
      .filter((e) => e.kind === 'holdProgress' && e.progress > 0);
    expect(shown).toEqual([]);
  });

  it('custom Model Maker label held: explain', () => {
    expect(run(30, () => [right({ gesture: 'Rock' })])).toEqual(['fire:explain']);
  });

  it('low-confidence labels are ignored', () => {
    expect(run(60, () => [right({ gesture: 'Open_Palm', score: 0.3 })])).toEqual([]);
  });

  it('a one-frame tracking dropout keeps the drag and push-to-talk alive', () => {
    expect(run(40, (i) => (i === 20 ? [] : [right({ pinch: 1 })]))).toEqual(['pinchStart:right', 'circle:right']); // prettier-ignore
    const raised = (i: number) => (i === 20 ? [] : [left({ gesture: 'Open_Palm' })]);
    expect(run(40, (i) => [right({ pose: 'point' }), ...raised(i)])).toEqual(['talk:on']);
  });

  it('hands lost: pinch ends, then one handsLost after 500 ms', () => {
    const seq = run(60, (i) => (i < 10 ? [right({ pinch: 1 })] : []));
    expect(seq).toEqual(['pinchStart:right', 'pinchEnd:right', 'handsLost']);
  });

  it('talking with hands: no fire, talk or pinchStart', () => {
    const talking = (i: number): RawHand[] => {
      const label =
        i >= 100 && i < 140
          ? 'Open_Palm' // long open palm, but the hand keeps moving
          : i % 60 >= 10 && i % 60 < 22
            ? 'Open_Palm' // short open-palm stretches
            : i % 97 < 2
              ? 'Victory' // 2-frame flickers
              : i % 53 === 5
                ? 'Thumb_Down'
                : i % 71 >= 30 && i % 71 < 32
                  ? 'Closed_Fist'
                  : 'None';
      const cx = i >= 100 && i < 140 ? 0.25 + (i - 100) * 0.005 : 0.45 + 0.1 * Math.sin(i / 15);
      const pinch = i % 37 === 0 ? 0.8 : 0.3 + 0.25 * Math.sin(i / 6); // rare 1-frame near-pinch
      return [
        right({ cx, cy: 0.7 + 0.05 * Math.sin(i / 9), pinch, gesture: label }),
        left({ cx: 0.7 + 0.08 * Math.sin(i / 11), pinch: 0.4 + 0.2 * Math.sin(i / 5) }),
      ];
    };
    const seq = run(180, talking);
    expect(seq.filter((s) => NO_FALSE_TRIGGERS.test(s))).toEqual([]);
  });
});

// Real fixtures (recorded with Shift+R) are checked against tests/fixtures/expected.json.
// Any fixture whose name contains "talking" must produce no fire / talk / pinchStart.
describe('GestureClassifier (recorded fixtures)', () => {
  const expected = loadExpected();
  for (const name of listFixtures()) {
    it(name, () => {
      const seq = summarize(replay(loadFixture(name).frames));
      if (name.includes('talking')) expect(seq.filter((s) => NO_FALSE_TRIGGERS.test(s))).toEqual([]); // prettier-ignore
      const want = expected[name];
      if (want) expect(seq).toEqual(want);
      else if (!name.includes('talking')) throw new Error(`add "${name}" to tests/fixtures/expected.json (got ${JSON.stringify(seq)})`); // prettier-ignore
    });
  }
});
