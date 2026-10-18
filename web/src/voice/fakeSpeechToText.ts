// Scripted SpeechToText for tests (and for driving the app without a microphone).
import type { SpeechToText, SttHandlers } from './speechToText.ts';

export class FakeSpeechToText implements SpeechToText {
  available = true;
  /** What the "user" says on the next push-to-talk. */
  script = '';
  listening = false;
  private handlers: SttHandlers | null = null;

  start(handlers: SttHandlers): void {
    this.handlers = handlers;
    this.listening = true;
    handlers.ready();
    const words = this.script.split(' ');
    for (let i = 1; i < words.length; i++) handlers.interim(words.slice(0, i).join(' '));
  }

  stop(): void {
    if (!this.handlers) return;
    this.listening = false;
    const h = this.handlers;
    this.handlers = null;
    h.final(this.script, performance.now());
  }

  abort(): void {
    this.listening = false;
    this.handlers = null;
  }
}
