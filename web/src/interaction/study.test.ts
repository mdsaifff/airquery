import { describe, expect, it } from 'vitest';
import {
  confusionCsv,
  confusionMatrix,
  FalseTriggerCounter,
  GestureStudy,
  outcomeOf,
  shuffled,
  STUDY_GESTURES,
  trialsCsv,
} from './study.ts';
import type { StudyGesture } from './study.ts';
import type { GestureEvent } from './types.ts';

const timing = { timeoutMs: 5000, pointHoldMs: 1000, restMs: 500 };

/** The event a perfect participant produces for each prompt. */
const PERFECT: Record<StudyGesture, GestureEvent | null> = {
  point: null, // cursor only
  pinch: { kind: 'pinchStart', hand: 'right', x: 0, y: 0 },
  zoom: { kind: 'twoHandZoom', scaleDelta: 1.1 },
  talk: { kind: 'talk', active: true },
  undo: { kind: 'fire', gesture: 'undo' },
  reset: { kind: 'fire', gesture: 'reset' },
  clutch: { kind: 'clutch', active: true },
};

function runStudy(react: (g: StudyGesture) => GestureEvent | null, tries = 3) {
  const study = new GestureStudy('p1', tries, 42, timing);
  let now = 0;
  while (!study.done && now < 1e7) {
    study.tick(now);
    if (study.active) {
      study.onEvent({ kind: 'cursor', x: 1, y: 1 }, now);
      if (now % 1000 === 300) {
        const e = react(study.active);
        if (e) study.onEvent(e, now);
      }
    }
    now += 100;
  }
  return study;
}

describe('GestureStudy', () => {
  it('runs every gesture N times in a reproducible shuffled order', () => {
    const study = runStudy((g) => PERFECT[g]);
    expect(study.done).toBe(true);
    expect(study.trials).toHaveLength(STUDY_GESTURES.length * 3);
    expect(study.trials.every((t) => t.detected === t.expected)).toBe(true);
    const order = study.trials.map((t) => t.expected);
    expect(order).toEqual(runStudy((g) => PERFECT[g]).trials.map((t) => t.expected));
    expect(order.slice(0, 7)).not.toEqual([...STUDY_GESTURES]); // actually shuffled
  });

  it('records confusions, timeouts and point-by-default', () => {
    // Participant: makes a fist when asked to pinch, does nothing for undo.
    const study = runStudy((g) =>
      g === 'pinch' ? PERFECT.clutch : g === 'undo' ? null : PERFECT[g],
    );
    const m = confusionMatrix(study.trials);
    expect(m.pinch.clutch).toBe(3);
    expect(m.undo.point).toBe(3); // cursor visible, nothing else: counted as point
    expect(m.reset.reset).toBe(3);
    const csv = confusionCsv(study.trials).split('\n');
    expect(csv[0]).toBe('expected\\detected,point,pinch,zoom,talk,undo,reset,clutch,none,accuracy');
    expect(csv.find((r) => r.startsWith('pinch,'))).toBe('pinch,0,0,0,0,0,0,3,0,0.000');
    expect(csv.find((r) => r.startsWith('reset,'))).toBe('reset,0,0,0,0,0,3,0,0,1.000');
  });

  it('no hands at all times out as none', () => {
    const study = new GestureStudy('p', 1, 1, timing);
    study.tick(0);
    study.tick(6000);
    expect(study.trials[0].detected).toBe('none');
    expect(study.trials[0].latencyMs).toBe(6000);
  });

  it('exports raw trials with quoted participant names', () => {
    const csv = trialsCsv([
      { participant: 'Ana "A"', index: 0, expected: 'pinch', detected: 'pinch', latencyMs: 900 },
    ]);
    expect(csv).toBe(
      'participant,index,expected,detected,correct,latency_ms\n"Ana ""A""",0,pinch,pinch,1,900\n',
    );
  });
});

describe('helpers', () => {
  it('maps events to outcomes', () => {
    expect(outcomeOf({ kind: 'talk', active: false })).toBeNull();
    expect(outcomeOf({ kind: 'fire', gesture: 'undo' })).toBe('undo');
    expect(outcomeOf({ kind: 'pinchMove', hand: 'left', x: 0, y: 0 })).toBeNull();
  });

  it('shuffle is a deterministic permutation', () => {
    const a = shuffled([1, 2, 3, 4, 5, 6], 7);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(shuffled([1, 2, 3, 4, 5, 6], 7)).toEqual(a);
  });

  it('counts false triggers per 5 minutes', () => {
    const c = new FalseTriggerCounter();
    c.onEvent({ kind: 'fire', gesture: 'reset' }); // not started: ignored
    c.start(0);
    c.onEvent({ kind: 'fire', gesture: 'reset' });
    c.onEvent({ kind: 'talk', active: true });
    c.onEvent({ kind: 'talk', active: false });
    c.onEvent({ kind: 'pinchMove', hand: 'left', x: 0, y: 0 });
    expect(c.counts).toEqual({ fire: 1, talk: 1, pinchStart: 0 });
    expect(c.ratePer5Min(600_000)).toBe(1);
  });
});
