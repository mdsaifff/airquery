// The year as a seismogram: one spike per time slice, coloured like its dot on the
// globe; filtered-out events stay as a faint trace. Plays along with the replay.
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { config } from '../config.ts';
import { binStrip, timeRange, timeTicks } from './seismogram.ts';
import { hudStore, useTick } from './store.ts';

const HEIGHT = 46; // css px
const SPEED_LABELS: Record<number, string> = { 1: 'day/s', 7: 'week/s', 30: 'month/s' };

/** The strip doubles as the time machine's timeline: play, speed, click or drag to jump. */
export function Seismogram({
  onToggle,
  onSeek,
  onSpeed,
}: {
  onToggle: () => void;
  onSeek: (fraction: number) => void;
  onSpeed: (daysPerSec: number) => void;
}) {
  useTick(15);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const tl = hudStore.timeline;
  const sizeCol = hudStore.sizeLegend?.column ?? null;
  const [t0, t1] = tl ? timeRange(tl.times) : [0, 0];
  // Redraw only when what is shown changes (shown count, colouring, size, width, replay).
  const key = `${hudStore.dataset}|${hudStore.shown}|${hudStore.legend?.column ?? ''}|${sizeCol}|${width}|${hudStore.introCutoff ?? ''}`; // prettier-ignore

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [tl]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !tl || width < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(width * dpr);
    el.height = HEIGHT * dpr;
    const cols = Math.floor(width / 2); // one spike per 2 css px
    const weights = sizeCol ? (tl.numbers.get(sizeCol) ?? null) : null;
    const strip = binStrip(tl.times, weights, tl.visible, cols);
    const mid = el.height / 2;
    const half = mid - dpr;
    ctx.lineWidth = dpr;
    ctx.fillStyle = 'rgb(237 234 228 / 14%)';
    ctx.fillRect(0, Math.round(mid), el.width, dpr); // baseline
    for (let x = 0; x < cols; x++) {
      const px = (x * 2 + 1) * dpr;
      const h = strip.hidden[x];
      if (h > 0) {
        ctx.fillStyle = 'rgb(237 234 228 / 12%)';
        ctx.fillRect(px, mid - h * half, dpr, 2 * h * half);
      }
      const a = strip.shown[x];
      const row = strip.shownRow[x];
      if (a > 0 && row >= 0) {
        const [r, g, b] = [0, 1, 2].map((c) => Math.round(tl.colors[row * 3 + c] * 255));
        ctx.fillStyle = `rgb(${r} ${g} ${b})`;
        ctx.fillRect(px, mid - a * half, dpr, 2 * a * half);
      }
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tl) return null;
  const pb = hudStore.playback;
  const seek = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.type === 'pointermove' && e.buttons !== 1) return;
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };
  const cutoff = hudStore.introCutoff;
  const at = cutoff !== null && t1 > t0 ? (cutoff - t0) / (t1 - t0) : null;
  return (
    <figure className="seismo" aria-label="Events over time">
      {pb.available && (
        <div className="seismo-controls">
          <button
            className="play"
            onClick={onToggle}
            aria-label={pb.playing ? 'Pause' : 'Play the year'}
          >
            {pb.playing ? '❚❚' : '▶'}
          </button>
          {config.timeSpeeds.map((s) => (
            <button key={s} className={pb.speed === s ? 'on' : ''} onClick={() => onSpeed(s)}>
              {SPEED_LABELS[s] ?? `${s}d/s`}
            </button>
          ))}
          <span className="hint">L to play · click the strip to jump</span>
        </div>
      )}
      <canvas
        ref={canvas}
        style={{ height: HEIGHT, cursor: 'pointer' }}
        onPointerDown={seek}
        onPointerMove={seek}
      />
      {at !== null && (
        <div className="playhead" style={{ left: `${at * 100}%` }}>
          <span>{hudStore.introDate}</span>
        </div>
      )}
      <div className="ticks" aria-hidden="true">
        {timeTicks(t0, t1).map((t) => (
          <span key={t.label} style={{ left: `${t.at * 100}%` }}>
            {t.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
