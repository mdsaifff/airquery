// The globe's spoken reply, as a subtitle under the globe; plus the 🔊 toggle.
import { hudStore, useTick } from './store.ts';

export function Subtitle() {
  const now = useTick(8);
  const s = hudStore.reply;
  if (!s.text || now > s.until) return null;
  return (
    <p className="subtitle" aria-live="polite">
      {s.text}
    </p>
  );
}

export function MuteToggle({ onToggle }: { onToggle: () => void }) {
  useTick(4);
  return (
    <button
      className="mute-btn"
      onClick={onToggle}
      aria-label={hudStore.muted ? 'Turn the voice on' : 'Turn the voice off'}
    >
      {hudStore.muted ? '🔇' : '🔊'}
    </button>
  );
}
