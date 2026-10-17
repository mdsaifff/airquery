// Voice is the main way in: a rotating example of something to say, under the talk bar.
import { config } from '../config.ts';
import { useTick } from './store.ts';

export function TryHints() {
  const now = useTick(1);
  const hints = config.voiceHints;
  const hint = hints[Math.floor(now / config.voiceHintMs) % hints.length];
  return (
    <p className="try-hints" aria-live="off">
      Try saying “{hint}”
    </p>
  );
}
