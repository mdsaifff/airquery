// Web Speech API implementation. Reliable in Chromium only; note Chrome sends
// the audio to Google's servers (D-004), unlike the hand tracking.
import type { SpeechToText, SttHandlers } from './speechToText.ts';

// Minimal typings: lib.dom does not ship SpeechRecognition.
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onaudiostart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as Record<string, RecognitionCtor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export class WebSpeechToText implements SpeechToText {
  readonly available = recognitionCtor() !== null;
  private rec: Recognition | null = null;
  private releasedAt = 0;

  start(handlers: SttHandlers): void {
    const Ctor = recognitionCtor();
    if (!Ctor) return handlers.error('Speech recognition is not available in this browser.');
    this.rec?.stop();
    const rec = new Ctor();
    this.rec = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    let finalText = '';
    rec.onaudiostart = () => handlers.ready();
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      handlers.interim((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted')
        handlers.error(`Speech error: ${e.error}`);
    };
    rec.onend = () => {
      if (this.rec === rec) this.rec = null;
      handlers.final(finalText.trim(), this.releasedAt || performance.now());
    };
    this.releasedAt = 0;
    rec.start();
  }

  stop(): void {
    this.releasedAt = performance.now();
    this.rec?.stop();
  }
}
