// Push-to-talk -> transcript -> submit. Spoken and typed utterances share one path.
import type { SpeechToText } from './speechToText.ts';

export interface VoiceView {
  /** Live transcript (interim, then final). */
  transcript(text: string, final: boolean): void;
  listening(active: boolean): void;
  /** The microphone is really recording: "speak now". */
  ready(): void;
  error(message: string): void;
}

/** Called with the utterance, when it was finished (ms, performance.now()) and whether it was spoken. */
export type Submit = (utterance: string, endedAt: number, spoken: boolean) => void;

export class VoiceController {
  private readonly stt: SpeechToText;
  private readonly view: VoiceView;
  private readonly submit: Submit;
  private active = false;

  constructor(stt: SpeechToText, view: VoiceView, submit: Submit) {
    this.stt = stt;
    this.view = view;
    this.submit = submit;
  }

  /** Driven by the state machine's start/stopListening effects (other hand raised, or spacebar). */
  setListening(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.view.listening(active);
    if (!this.stt.available) {
      if (active) this.view.error('No speech recognition here (try Chrome). Type instead.');
      return;
    }
    if (!active) return this.stt.stop();
    this.view.transcript('', false);
    this.stt.start({
      ready: () => this.view.ready(),
      interim: (text) => this.view.transcript(text, false),
      final: (text, releasedAt) => {
        this.view.transcript(text, true);
        if (text.trim()) this.submit(text.trim(), releasedAt, true);
      },
      error: (message) => this.view.error(message),
    });
  }

  /** Typed fallback: always works, with or without a microphone. */
  typed(text: string): void {
    const t = text.trim();
    if (!t) return;
    this.view.transcript(t, true);
    this.submit(t, performance.now(), false);
  }
}
