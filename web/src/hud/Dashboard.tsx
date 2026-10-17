// Right column: what is on screen as small charts. Click a bar or a region to filter.
import { useState } from 'react';
import type { Bar, Chart } from './dashboard.ts';
import { hudStore, useTick } from './store.ts';

type Pick = (chart: Chart, bar: Bar) => void;

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
            disabled={b.count === 0}
            onClick={() => onPick(chart, b)}
          >
            <i style={{ height: `${(b.count / max) * 100}%` }} />
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
              <span className="meter">
                <i style={{ width: `${(b.count / max) * 100}%` }} />
              </span>
              <span className="n">{b.count.toLocaleString()}</span>
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
        On screen <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <p className="dash-summary">
            <b>{d.count.toLocaleString()}</b> shown
            {d.maxSize !== null && (
              <>
                {' '}
                · strongest <b>{d.maxSize.toFixed(1)}</b>
              </>
            )}
            {d.medianDepth !== null && (
              <>
                {' '}
                · median depth <b>{Math.round(d.medianDepth)} km</b>
              </>
            )}
          </p>
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
        </>
      )}
    </aside>
  );
}
