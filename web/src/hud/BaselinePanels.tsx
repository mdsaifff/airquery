// Mouse baseline (B): dropdown filters instead of voice; task timer (T) for the
// hands-vs-mouse study in docs/EVAL.md.
import { useState } from 'react';
import type { QuerySpec } from '../contracts/contracts.ts';
import {
  buildSpec,
  DEFAULT_FORM,
  DEPTH_OPTIONS,
  STUDY_TASKS,
  TaskTimer,
} from '../interaction/baseline.ts';
import type { BaselineForm, StudyMode } from '../interaction/baseline.ts';
import { downloadText } from '../tracking/recorder.ts';
import { hudStore, useTick } from './store.ts';

const MONTHS = Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}`);

interface BaselineProps {
  onApply: (spec: QuerySpec) => void;
  onUndo: () => void;
  onResetView: () => void;
}

export function BaselinePanel({ onApply, onUndo, onResetView }: BaselineProps) {
  useTick(4);
  const [form, setForm] = useState<BaselineForm>(DEFAULT_FORM);
  if (hudStore.dataset !== 'quakes') {
    return (
      <section className="panel baseline" aria-label="Mouse baseline filters">
        <div className="label">mouse mode · the study filters cover the earthquake globe</div>
      </section>
    );
  }
  const set = <K extends keyof BaselineForm>(key: K, value: BaselineForm[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    onApply(buildSpec(next));
  };
  return (
    <section className="panel baseline" aria-label="Mouse baseline filters">
      <div className="label">mouse mode · drag to rotate, wheel to zoom</div>
      <label>
        depth
        <select
          value={form.depth}
          onChange={(e) => set('depth', e.target.value as BaselineForm['depth'])}
        >
          {Object.entries(DEPTH_OPTIONS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        magnitude
        <select
          value={form.minMagnitude}
          onChange={(e) => set('minMagnitude', e.target.value as BaselineForm['minMagnitude'])}
        >
          <option value="any">any</option>
          <option value="5">5 and up</option>
          <option value="6">6 and up</option>
          <option value="7">7 and up</option>
        </select>
      </label>
      <label>
        place
        <select value={form.place} onChange={(e) => set('place', e.target.value)}>
          <option value="">anywhere</option>
          {hudStore.placeOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label>
        time
        <select value={form.period} onChange={(e) => set('period', e.target.value)}>
          <option value="any">all</option>
          <option value="2024">2024</option>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        colour by
        <select
          value={form.colorBy}
          onChange={(e) => set('colorBy', e.target.value as BaselineForm['colorBy'])}
        >
          <option value="depth_km">depth</option>
          <option value="magnitude">magnitude</option>
          <option value="time">time</option>
        </select>
      </label>
      <label>
        show
        <select
          value={form.top}
          onChange={(e) => set('top', e.target.value as BaselineForm['top'])}
        >
          <option value="all">all matches</option>
          <option value="10">10 strongest</option>
          <option value="50">50 strongest</option>
        </select>
      </label>
      <div className="row">
        <button onClick={onUndo}>undo</button>
        <button onClick={onResetView}>reset view</button>
      </div>
    </section>
  );
}

export function TaskPanel({ mode }: { mode: StudyMode }) {
  const now = useTick(10);
  const [timer] = useState(() => new TaskTimer());
  const [participant, setParticipant] = useState('p1');
  const cur = timer.current;
  return (
    <section className="panel tasks" aria-label="Study task timer">
      <h2>
        Study tasks <span className="label">mode: {mode}</span>
      </h2>
      <input
        aria-label="Participant"
        value={participant}
        onChange={(e) => setParticipant(e.target.value)}
      />
      <ol>
        {STUDY_TASKS.map((task, i) => {
          const done = timer.results.filter((r) => r.task === i + 1 && r.mode === mode).at(-1);
          return (
            <li key={task} className={cur?.task === i ? 'active' : ''}>
              {task}{' '}
              {cur?.task === i ? (
                <span className="label">
                  {((now - cur.startedAt) / 1000).toFixed(1)} s · errors {cur.errors}
                </span>
              ) : done ? (
                <span className="label">
                  {done.seconds} s{done.completed ? '' : ' (gave up)'}
                </span>
              ) : null}
              {!cur && <button onClick={() => timer.start(i, performance.now())}>start</button>}
            </li>
          );
        })}
      </ol>
      {cur && (
        <div className="row">
          <button onClick={() => timer.finish(participant, mode, performance.now())}>done</button>
          <button onClick={() => timer.error()}>+ error</button>
          <button onClick={() => timer.finish(participant, mode, performance.now(), false)}>
            gave up
          </button>
        </div>
      )}
      {timer.results.length > 0 && (
        <button onClick={() => downloadText(`tasks-${participant}.csv`, timer.csv())}>
          tasks CSV
        </button>
      )}
    </section>
  );
}
