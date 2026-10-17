// Dev-only sliders that edit config.ts values live (toggle with D).
import { useState } from 'react';
import { config } from '../config.ts';

interface Slider {
  label: string;
  obj: Record<string, unknown>;
  key: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: Slider[] = [
  { label: 'filter minCutoff (Hz)', obj: config.filter, key: 'minCutoff', min: 0.05, max: 5, step: 0.05 },
  { label: 'filter beta', obj: config.filter, key: 'beta', min: 0, max: 0.1, step: 0.001 },
  { label: 'pinch enter', obj: config.gesture, key: 'pinchEnter', min: 0.1, max: 1, step: 0.01 },
  { label: 'pinch exit', obj: config.gesture, key: 'pinchExit', min: 0.1, max: 1.2, step: 0.01 },
  { label: 'pinch frames', obj: config.gesture, key: 'pinchStableFrames', min: 1, max: 10, step: 1 },
  { label: 'label hold frames', obj: config.gesture, key: 'labelStableFrames', min: 1, max: 15, step: 1 },
  { label: 'reset hold (ms)', obj: config.gesture, key: 'resetHoldMs', min: 100, max: 2000, step: 50 },
  { label: 'pinch-hold circle (ms)', obj: config.gesture, key: 'circleHoldMs', min: 200, max: 2000, step: 50 },
]; // prettier-ignore

export function DebugPanel() {
  const [, setVersion] = useState(0);
  return (
    <div className="debug-panel">
      <strong>debug (D)</strong>
      {SLIDERS.map((s) => (
        <label key={s.label}>
          <span>
            {s.label}: {String(s.obj[s.key])}
          </span>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={Number(s.obj[s.key])}
            onChange={(e) => {
              s.obj[s.key] = Number(e.target.value);
              setVersion((v) => v + 1);
            }}
          />
        </label>
      ))}
      <button onClick={() => console.log(JSON.stringify(config, null, 2))}>log config</button>
    </div>
  );
}
