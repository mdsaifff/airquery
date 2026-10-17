// Right column: what is on screen as small charts. Click a bar or a region to filter.
// Bars for the colour column wear the globe's colours; the replay's month glows ember.
import { useState } from 'react';
import { rampColor } from '../scene/colorRamp.ts';
import type { Bar, Chart } from './dashboard.ts';
import { hudStore, useTick } from './store.ts';

type Pick = (chart: Chart, bar: Bar) => void;

/** The ramp colour at a bar's middle, when the chart's column is what colours the dots. */
function tint(chart: Chart, b: Bar): string | undefined {
  const l = hudStore.legend;
  if (l?.kind !== 'ramp' || l.column !== chart.field || !(l.max > l.min)) return undefined;
  const c = [0, 0, 0];
  rampColor(((b.lo + b.hi) / 2 - l.min) / (l.max - l.min), c);
  return `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;
}

function Bars({ chart, onPick, marker }: { chart: Chart; onPick: Pick; marker: number | null }) {
  const max = Math.max(1, ...chart.bars.map((b) => b.count));
  return (
    <figure className="dash-chart">
      <figcaption>{chart.title}</figcaption>
      <div className="dash-bars">
        {chart.bars.map((b, i) => (
          <button
            key={b.label}
            className={i === marker ? 'now' : ''}
            title={`${b.label}: ${b.count.toLocaleString()}`}
            data-n={b.count.toLocaleString()}
            disabled={b.count === 0}
            onClick={() => onPick(chart, b)}
          >
            <i style={{ height: `${(b.count / max) * 100}%`, background: tint(chart, b) }} />
            <span>{b.label}</span>
          </button>
        ))}
      </div>
    </figure>
  );
}

function Regions({ chart, onPick }: { chart: Chart; onPick: Pick }) {
  const max = Math.max(1, ...chart.bars.map((b) => b.count));
  return (
    <figure className="dash-chart">
      <figcaption>{chart.title}</figcaption>
      <ol className="dash-regions">
        {chart.bars.map((b) => (
          <li key={b.label}>
            <button onClick={() => onPick(chart, b)}>
              <span className="name">{b.label}</span>
              <span className="n">{b.count.toLocaleString()}</span>
              <span className="meter">
                <i style={{ width: `${(b.count / max) * 100}%` }} />
              </span>
            </button>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function Dashboard({ onPick }: { onPick: Pick }) {
  useTick(4);
  const [open, setOpen] = useState(() => window.innerWidth > 760);
  const d = hudStore.dashboard;
  if (!d) return null;
  const month = hudStore.introCutoff === null ? null : new Date(hudStore.introCutoff).getUTCMonth();
  return (
    <aside className={`dash ${open ? '' : 'closed'}`} aria-label="What is on screen">
      <button className="dash-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        On screen
        <svg className="chev" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>
      {open && (
        <>
          <dl className="dash-summary">
            <div>
              <dt>shown</dt>
              <dd>{d.count.toLocaleString()}</dd>
            </div>
            {d.maxSize !== null && (
              <div>
                <dt>strongest</dt>
                <dd>{d.maxSize.toFixed(1)}</dd>
              </div>
            )}
            {d.medianDepth !== null && (
              <div>
                <dt>median depth</dt>
                <dd>
                  {Math.round(d.medianDepth)}
                  <small> km</small>
                </dd>
              </div>
            )}
          </dl>
          {d.charts.map((c) =>
            c.kind === 'text' ? (
              <Regions key={c.key} chart={c} onPick={onPick} />
            ) : (
              <Bars
                key={c.key}
                chart={c}
                onPick={onPick}
                marker={c.kind === 'time' ? month : null}
              />
            ),
          )}
          <p className="dash-hint">Click a bar or a region to show only those.</p>
        </>
      )}
    </aside>
  );
}
