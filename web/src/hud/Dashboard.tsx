// Right column: what is on screen as small charts. Display only: a spoken filter lights
// up the bars it covers. Bars for the colour column wear the globe's colours; the
// replay's month glows ember. "Show / hide the stats" (or the header) opens and closes it.
import { rampColor } from '../scene/colorRamp.ts';
import { coveredBars } from './dashboard.ts';
import type { Bar, Chart } from './dashboard.ts';
import { hudStore, useTick } from './store.ts';

/** The ramp colour at a bar's middle, when the chart's column is what colours the dots. */
function tint(chart: Chart, b: Bar): string | undefined {
  const l = hudStore.legend;
  if (l?.kind !== 'ramp' || l.column !== chart.field || !(l.max > l.min)) return undefined;
  const c = [0, 0, 0];
  rampColor(((b.lo + b.hi) / 2 - l.min) / (l.max - l.min), c);
  return `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;
}

function Bars({ chart, lit, marker }: { chart: Chart; lit: Set<number>; marker: number | null }) {
  const max = Math.max(1, ...chart.bars.map((b) => b.count));
  return (
    <figure className="dash-chart">
      <figcaption>{chart.title}</figcaption>
      <div className="dash-bars">
        {chart.bars.map((b, i) => (
          <div
            key={b.label}
            className={['bar', lit.has(i) ? 'on' : '', i === marker ? 'now' : ''].join(' ')}
            title={`${b.label}: ${b.count.toLocaleString()}`}
            data-n={b.count.toLocaleString()}
          >
            <i style={{ height: `${(b.count / max) * 100}%`, background: tint(chart, b) }} />
            <span>{b.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function Regions({ chart, lit }: { chart: Chart; lit: Set<number> }) {
  const max = Math.max(1, ...chart.bars.map((b) => b.count));
  return (
    <figure className="dash-chart">
      <figcaption>{chart.title}</figcaption>
      <ol className="dash-regions">
        {chart.bars.map((b, i) => (
          <li key={b.label} className={lit.has(i) ? 'on' : ''}>
            <span className="name">{b.label}</span>
            <span className="n">{b.count.toLocaleString()}</span>
            <span className="meter">
              <i style={{ width: `${(b.count / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function Dashboard() {
  useTick(4);
  const open = hudStore.statsOpen;
  const d = hudStore.dashboard;
  if (!d) return null;
  const month = hudStore.introCutoff === null ? null : new Date(hudStore.introCutoff).getUTCMonth();
  const filters = hudStore.glass.spec?.filters ?? [];
  return (
    <aside className={`dash ${open ? '' : 'closed'}`} aria-label="What is on screen">
      <button
        className="dash-head"
        onClick={() => (hudStore.statsOpen = !open)}
        aria-expanded={open}
      >
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
              <Regions key={c.key} chart={c} lit={coveredBars(c, filters)} />
            ) : (
              <Bars
                key={c.key}
                chart={c}
                lit={coveredBars(c, filters)}
                marker={c.kind === 'time' ? month : null}
              />
            ),
          )}
          <p className="dash-hint">Say “only magnitude 6 and up”: what you ask lights up here.</p>
        </>
      )}
    </aside>
  );
}
