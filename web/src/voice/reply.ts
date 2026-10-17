// The globe answers: every reply is a subtitle, and spoken unless muted (remembered).
import { config } from '../config.ts';
import { hudStore } from '../hud/store.ts';

const KEY = 'airquery.muted';

function readMuted(storage: Storage | null | undefined): boolean {
  try {
    return storage?.getItem(KEY) === '1';
  } catch {
    return false; // storage blocked: not muted
  }
}

export interface ReplierDeps {
  speak(text: string): void;
  stop(): void;
  storage?: Storage | null;
}

export class Replier {
  private readonly deps: ReplierDeps;
  private mutedNow: boolean;

  constructor(deps: ReplierDeps) {
    this.deps = deps;
    this.mutedNow = readMuted(deps.storage);
    hudStore.muted = this.mutedNow;
  }

  get muted(): boolean {
    return this.mutedNow;
  }

  say(text: string, now: number): void {
    if (!text) return;
    const { base, perChar } = config.subtitleMs;
    hudStore.reply = { text, until: now + base + perChar * text.length };
    this.deps.stop(); // a new reply cuts off the old one
    if (!this.mutedNow) this.deps.speak(text);
  }

  /** The user started talking: stop speaking (the subtitle stays). */
  hush(): void {
    this.deps.stop();
  }

  setMuted(m: boolean): void {
    this.mutedNow = m;
    hudStore.muted = m;
    if (m) this.deps.stop();
    try {
      this.deps.storage?.setItem(KEY, m ? '1' : '0');
    } catch {
      // storage blocked: the choice lasts until reload
    }
  }
}
