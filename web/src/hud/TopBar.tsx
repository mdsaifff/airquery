// Top-left masthead: wordmark, a large ticking count of what is shown, the
// dataset description (or the replay date), and the Replay button.
import { hudStore, useTick } from './store.ts';

const NOUNS: Record<string, string> = { quakes: 'earthquakes', papers: 'papers' };

export function TopBar({ onReplay }: { onReplay: () => void }) {
  useTick(30);
  const { total, dataset, introDate, subtitle } = hudStore;
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
          {NOUNS[dataset] ?? 'points'}
          {filtered && <span className="of">of {total.toLocaleString()}</span>}
        </span>
      </div>
      <p className="sub">{introDate ? `Replaying the year: ${introDate}` : subtitle}</p>
      {dataset === 'quakes' && (
        <button className="text-btn" onClick={onReplay}>
          Replay the year
        </button>
      )}
    </header>
  );
}
