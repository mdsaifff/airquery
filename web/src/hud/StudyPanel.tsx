// Guided gesture study (toggle with G): prompts each gesture N times, records
// what the classifier detected, exports CSVs; plus the false-trigger counter.
import { useState } from 'react';
import { config } from '../config.ts';
import {
  confusionCsv,
  confusionMatrix,
  PROMPTS,
  STUDY_GESTURES,
  trialsCsv,
} from '../interaction/study.ts';
import type { StudyHost } from '../interaction/study.ts';
import { downloadText } from '../tracking/recorder.ts';
import { useTick } from './store.ts';

const today = () => new Date().toISOString().slice(0, 10);

export function StudyPanel({ host }: { host: StudyHost }) {
  const now = useTick(10);
  const [participant, setParticipant] = useState('p1');
  const [tries, setTries] = useState(20);
  const { study, counter } = host;
  const last = study?.trials.at(-1);

  return (
    <section className="panel study" aria-label="Gesture study">
      <h2>Gesture study</h2>
      {!study || study.done ? (
        <div className="row">
          <input
            aria-label="Participant"
            value={participant}
            onChange={(e) => setParticipant(e.target.value)}
          />
          <input
            aria-label="Tries per gesture"
            type="number"
            min={1}
            max={50}
            value={tries}
            onChange={(e) => setTries(Number(e.target.value))}
          />
          <button
            onClick={() => {
              host.begin(participant, tries, Date.now() % 100_000, config.study);
            }}
          >
            start {tries}×{STUDY_GESTURES.length} trials
          </button>
        </div>
      ) : (
        <>
          <div className="prompt">{study.active ? PROMPTS[study.active] : 'relax…'}</div>
          <div className="label">
            trial {study.trials.length + 1} / {study.total}
            {last &&
              ` · last: ${last.expected} → ${last.detected} ${last.expected === last.detected ? '✓' : '✗'}`}
          </div>
          <button onClick={() => host.end()}>stop</button>
        </>
      )}
      {study && study.trials.length > 0 && (
        <>
          <table>
            <tbody>
              {STUDY_GESTURES.map((g) => {
                const row = confusionMatrix(study.trials)[g];
                const n = Object.values(row).reduce((a, b) => a + b, 0);
                return (
                  <tr key={g}>
                    <td>{g}</td>
                    <td>{n ? `${Math.round((100 * row[g]) / n)}%` : '–'}</td>
                    <td className="label">n={n}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="row">
            <button
              onClick={() =>
                downloadText(`confusion-${participant}-${today()}.csv`, confusionCsv(study.trials))
              }
            >
              confusion CSV
            </button>
            <button
              onClick={() =>
                downloadText(`trials-${participant}-${today()}.csv`, trialsCsv(study.trials))
              }
            >
              trials CSV
            </button>
          </div>
        </>
      )}
      <h2>False triggers while talking</h2>
      <div className="row">
        {counter.startedAt === null ? (
          <button onClick={() => counter.start(performance.now())}>start counter</button>
        ) : (
          <button onClick={() => counter.stop()}>stop</button>
        )}
        <span className="label">
          fire {counter.counts.fire} · talk {counter.counts.talk} · pinch{' '}
          {counter.counts.pinchStart}
          {counter.startedAt !== null &&
            ` · ${((now - counter.startedAt) / 60000).toFixed(1)} min · ${counter.ratePer5Min(now).toFixed(2)} / 5 min`}
        </span>
      </div>
    </section>
  );
}
