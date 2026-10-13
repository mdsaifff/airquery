import { useState } from 'react';
import { hudStore, useTick } from './store.ts';

/** Live transcript strip plus the typed-input fallback (Enter submits). */
export function TranscriptBar({ onSubmit }: { onSubmit: (text: string) => void }) {
  useTick();
  const [text, setText] = useState('');
  const { listening, transcript, transcriptFinal } = hudStore;
  return (
    <div className={`transcript ${listening ? 'is-listening' : ''}`}>
      <span className="mic" aria-label={listening ? 'listening' : 'microphone idle'} />
      <span className={`said ${transcriptFinal ? 'final' : ''}`}>
        {listening && !transcript ? 'listening…' : transcript || 'hold ✌ or space to talk'}
      </span>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(text);
          setText('');
        }}
      >
        <input
          aria-label="Type a request"
          placeholder="…or type a request"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
        />
      </form>
    </div>
  );
}

export function Toasts() {
  const now = useTick();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {hudStore.toasts
        .filter((t) => t.until > now)
        .map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
    </div>
  );
}
