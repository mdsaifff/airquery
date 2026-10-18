// Speech-to-text behind an interface (D-004): Web Speech today, swappable later.

export interface SttHandlers {
  /** The engine is actually recording now: words from here on are heard. */
  ready(): void;
  /** Partial transcript while the user is still talking. */
  interim(text: string): void;
  /** Final transcript after stop(); releasedAt = performance.now() when push-to-talk ended. */
  final(text: string, releasedAt: number): void;
  error(message: string): void;
}

export interface SpeechToText {
  /** False when the browser has no usable engine; the typed input still works. */
  readonly available: boolean;
  start(handlers: SttHandlers): void;
  /** Ends listening; the final transcript arrives through handlers.final. */
  stop(): void;
  /** Ends listening and drops everything heard: no handler is called again. */
  abort(): void;
}
