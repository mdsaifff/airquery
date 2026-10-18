// A short soft tick: "the microphone is recording now, speak".
import { config } from '../config.ts';

let ctx: AudioContext | null = null;

export function tick(): void {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const { hz, gain, ms } = config.readyTick;
    const end = ctx.currentTime + ms / 1000;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.frequency.value = hz;
    vol.gain.setValueAtTime(gain, ctx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(vol).connect(ctx.destination);
    osc.start();
    osc.stop(end);
  } catch {
    // No audio output: the green talk bar still says it.
  }
}
