// Custom gesture (C): record labelled webcam frames for the Model Maker notebook
// (notebooks/custom_gesture.ipynb). Shows which gesture model is loaded.
import { useState } from 'react';
import { config } from '../config.ts';
import { HandTracker } from '../tracking/handTracker.ts';
import { toast } from './store.ts';

/** Model Maker replaces the stock classifier, so retrain the stock labels too. */
const LABELS = ['none', 'Closed_Fist', 'Open_Palm', 'Pointing_Up', 'Thumb_Down', 'Victory', 'ILoveYou', config.gesture.customExplainLabel]; // prettier-ignore

interface Props {
  capture(label: string, onProgress: (done: number) => void): Promise<void>;
}

export function CapturePanel({ capture }: Props) {
  const [label, setLabel] = useState(config.gesture.customExplainLabel);
  const [state, setState] = useState<'idle' | 'countdown' | 'recording'>('idle');
  const [done, setDone] = useState(0);
  const start = async () => {
    setState('countdown');
    await new Promise((r) => setTimeout(r, 3000)); // time to get the hand in place
    setState('recording');
    try {
      await capture(label, setDone);
      toast('info', `Saved ${label}.tar (${config.captureFrames} frames).`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setState('idle');
      setDone(0);
    }
  };
  return (
    <section className="panel capture" aria-label="Custom gesture capture">
      <h2>Custom gesture data</h2>
      <div className="label">model: {HandTracker.model} · notebooks/custom_gesture.ipynb</div>
      <p>
        Record each label below (about {config.captureFrames} frames each, vary the angle and
        distance). Holding <b>{config.gesture.customExplainLabel}</b> will ask “what's this?”.
      </p>
      <div className="row">
        <select
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={state !== 'idle'}
        >
          {LABELS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <button onClick={() => void start()} disabled={state !== 'idle'}>
          {state === 'idle'
            ? 'record'
            : state === 'countdown'
              ? 'get ready…'
              : `${done} / ${config.captureFrames}`}
        </button>
      </div>
    </section>
  );
}
