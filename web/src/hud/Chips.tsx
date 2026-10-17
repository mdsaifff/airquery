// One-click suggestions (no AI needed) plus "Surprise me".
import type { Chip } from '../data/chips.ts';
import { hudStore, useTick } from './store.ts';

export function Chips({
  onPick,
  onSurprise,
}: {
  onPick: (c: Chip) => void;
  onSurprise: () => void;
}) {
  useTick(2);
  const pinned = hudStore.chips.filter((c) => c.pinned);
  if (pinned.length === 0) return null;
  return (
    <nav className="chips" aria-label="Try these">
      {pinned.map((c) => (
        <button key={c.label} className="chip" onClick={() => onPick(c)}>
          {c.label}
        </button>
      ))}
      <button className="chip surprise" onClick={onSurprise}>
        🎲 Surprise me
      </button>
    </nav>
  );
}
