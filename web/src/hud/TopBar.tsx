// Top-left masthead: wordmark, a large ticking count of what is shown, the
// dataset description (or the replay date), the scene picker and the Replay / Share links.
import { CSV_INPUT_ID } from './CsvPanel.tsx';
import { hudStore, useTick } from './store.ts';

interface Props {
  onReplay: () => void;
  onShare: () => void;
  onPickScene: (name: string) => void;
}

export function TopBar({ onReplay, onShare, onPickScene }: Props) {
  useTick(30);
  const { total, dataset, noun, introDate, subtitle, scenes } = hudStore;
  const filtered = total > 0 && hudStore.shown < total && !introDate;
  return (
    <header className="masthead">
      <div className="brand">
        <span className="logo" aria-hidden="true" />
        AirQuery
      </div>
      <div className="count" aria-live="polite">
        <b>{Math.round(hudStore.shownDisplay).toLocaleString()}</b>
        <span className="noun">
          {noun}
          {filtered && <span className="of">of {total.toLocaleString()}</span>}
        </span>
      </div>
      <p className="sub">{introDate ? `Replaying the year: ${introDate}` : subtitle}</p>
      <div className="scene-row">
        <label className="scene-pick">
          <span>Scene</span>
          <select value={dataset} onChange={(e) => onPickScene(e.target.value)}>
            {scenes.map((s) => (
              <option key={s.name} value={s.name}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-btn" htmlFor={CSV_INPUT_ID}>
          Open a CSV
        </label>
      </div>
      <div className="masthead-links">
        {hudStore.playback.available && (
          <button className="text-btn" onClick={onReplay}>
            {dataset === 'quakes' ? 'Replay the year' : 'Replay over time'}
          </button>
        )}
        <button className="text-btn" onClick={onShare}>
          Share this view
        </button>
      </div>
    </header>
  );
}
