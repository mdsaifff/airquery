// Records a few seconds of raw tracking frames into a fixture (dev tool, T1.3).
import type { RawFrame } from './rawFrame.ts';

export interface Fixture {
  version: 1;
  name: string;
  recordedAt: string;
  frames: RawFrame[];
}

export class LandmarkRecorder {
  private frames: RawFrame[] = [];
  private until = 0;

  get recording(): boolean {
    return this.until > 0;
  }

  start(now: number, durationMs: number): void {
    this.frames = [];
    this.until = now + durationMs;
  }

  /** Feed every tracking frame; returns the finished fixture once the duration has passed. */
  push(frame: RawFrame, name: string): Fixture | null {
    if (!this.recording) return null;
    if (frame.t < this.until) {
      this.frames.push(frame);
      return null;
    }
    this.until = 0;
    return { version: 1, name, recordedAt: new Date().toISOString(), frames: this.frames };
  }
}

/** Browser-only: save JSON as a file download. */
export function downloadJson(filename: string, data: unknown): void {
  downloadText(filename, JSON.stringify(data), 'application/json');
}

/** Browser-only: save text (CSV, JSON...) as a file download. */
export function downloadText(filename: string, text: string, type = 'text/csv'): void {
  downloadBlob(filename, new Blob([text], { type }));
}

/** Browser-only: save any blob as a file download. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
