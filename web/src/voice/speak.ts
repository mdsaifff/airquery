// Spoken summaries (browser speechSynthesis). Silently does nothing where unsupported.
// Picks the most natural installed voice unless the user chose one (V panel).
import { config } from '../config.ts';

export type VoiceLike = Pick<SpeechSynthesisVoice, 'name' | 'lang'>;

const STORAGE_KEY = 'airquery.voice';

/** Most natural first: neural "(Natural)" voices (Edge / Windows 11), then Chrome's Google voices. */
const RANKING: ((v: VoiceLike) => boolean)[] = [
  (v) => /natural/i.test(v.name) && v.lang.startsWith('en'),
  (v) => v.name === 'Google US English',
  (v) => v.name === 'Google UK English Female',
  (v) => v.name.startsWith('Google') && v.lang.startsWith('en'),
  (v) => v.lang.startsWith('en'),
];

/** The user's choice if installed, else the best-ranked voice, else null (browser default). */
export function pickVoice<V extends VoiceLike>(
  voices: readonly V[],
  preferred: string | null,
): V | null {
  const chosen = preferred ? voices.find((v) => v.name === preferred) : undefined;
  if (chosen) return chosen;
  for (const match of RANKING) {
    const v = voices.find(match);
    if (v) return v;
  }
  return null;
}

export function preferredVoice(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setPreferredVoice(name: string | null): void {
  try {
    if (name) localStorage.setItem(STORAGE_KEY, name);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked (private window): the choice lasts until reload
  }
}

/** Installed voices; the list fills in asynchronously, so listen for `voiceschanged` too. */
export function voices(): SpeechSynthesisVoice[] {
  return 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];
}

export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(voices(), preferredVoice());
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  u.rate = config.speechRate;
  window.speechSynthesis.speak(u);
}
