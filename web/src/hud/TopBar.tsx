// Top-centre title bar: wordmark, a ticking count of what is shown, the dataset
// description (or the replay date), and the Replay button.
import { hudStore, useTick } from './store.ts';

const NOUNS: Record<string, string> = { quakes: 'earthquakes', papers: 'papers' };

export function TopBar({ onReplay }: { onReplay: () => void }) {
  useTick(30);
  const { total, dataset, introDate, subtitle } = hudStore;
  return (
    <header className="topbar panel">
      <div className="brand">
        <span className="logo" aria-hidden="true" />
        AirQuery
      </div>
      <div className="count" aria-live="polite">
        <b>{Math.round(hudStore.shownDisplay).toLocaleString()}</b> {NOUNS[dataset] ?? 'points'}
        {total > 0 && hudStore.shown < total && (
          <span className="of"> of {total.toLocaleString()}</span>
        )}
      </div>
      <div className="sub">{introDate ? `replaying · ${introDate}` : subtitle}</div>
      {dataset === 'quakes' && (
        <button className="ghost" onClick={onReplay} title="Replay the year">
          ↻ Replay
        </button>
      )}
    </header>
  );
}
