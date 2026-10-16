// HUD panels laid out for a 1080p screen recording: glass box top-left, stats
// top-right, legend + transcript bottom-left, webcam bottom-right.
import { useState } from 'react';
import { RAMP_CSS } from '../scene/colorRamp.ts';
import { highlightSpec, highlightSql } from './highlight.ts';
import type { Token } from './highlight.ts';
import { depthBands, sizeSamples } from './legend.ts';
import { formatLegendValue, formatMs, prettySpec, prettySql } from './format.ts';
import { metrics } from './metrics.ts';
import { hudStore, useTick } from './store.ts';

function Code({ tokens, className }: { tokens: Token[]; className?: string }) {
  return (
    <pre className={className}>
      {tokens.map((t, i) => (
        <span key={i} className={`tk-${t.kind}`}>
          {t.text}
        </span>
      ))}
    </pre>
  );
}

export function GlassBox() {
  useTick(4);
  const [open, setOpen] = useState(true);
  const { spec, sql, params } = hudStore.glass;
  const t = hudStore.timings;
  return (
    <section className="panel glass" aria-label="What ran">
      <button className="glass-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="label">What ran</span>
        {hudStore.thinking && <span className="thinking">thinking…</span>}
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <Code tokens={highlightSpec(prettySpec(spec))} />
          <Code tokens={highlightSql(sql ? prettySql(sql) : `SELECT * FROM ${hudStore.dataset}`)} />
          {params.length > 0 && <pre className="params">params {JSON.stringify(params)}</pre>}
          {t.total !== undefined && (
            <div className="timings">
              {t.llm === undefined
                ? `cached reply · agent ${formatMs(t.total)}`
                : `llm ${formatMs(t.llm)} · validate ${formatMs(t.validate ?? 0)} · compile ${formatMs(t.compile ?? 0)}`}
              {` · duckdb ${formatMs(hudStore.queryMs)}`}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function Stats() {
  useTick();
  return (
    <div className="stats panel">
      <div>
        render <b>{hudStore.renderFps.toFixed(0)}</b> fps · tracking{' '}
        <b>{hudStore.trackingFps.toFixed(0)}</b> fps
      </div>
      <div>
        voice→render <b>{formatMs(hudStore.latencyMs)}</b>
        {metrics.voiceToRender.count > 1 &&
          ` (median ${formatMs(metrics.voiceToRender.percentile(0.5))})`}
      </div>
      {hudStore.status && <div>{hudStore.status}</div>}
      {hudStore.cameraError && <div className="warn">{hudStore.cameraError}</div>}
    </div>
  );
}

export function CamLabel() {
  useTick(4);
  return <div className="cam-label">{hudStore.mode}</div>;
}

const columnLabel = (column: string, unit: string | null) => {
  const name = column.replace(/_km$/, '').replace(/_/g, ' ');
  return unit && unit !== column && !['UTC', 'magnitude'].includes(unit)
    ? `${name} (${unit})`
    : name;
};

export function HowToRead({ onToggleXray }: { onToggleXray: () => void }) {
  useTick(4);
  const l = hudStore.legend;
  const s = hudStore.sizeLegend;
  if (!l && !s && !hudStore.geo) return null;
  const isDepth = l?.kind === 'ramp' && l.column === hudStore.depthColumn;
  return (
    <section className="panel legend" aria-label="How to read this">
      <div className="label">How to read this</div>
      {l?.kind === 'ramp' && (
        <div className="row-block">
          <div className="key">Colour</div>
          <div className="what">{columnLabel(l.column, l.unit)}</div>
          <div className="ramp" style={{ background: RAMP_CSS }} />
          {isDepth ? (
            <div className="bands">
              {depthBands(l.min, l.max).map((b) => (
                <span key={b.label} style={{ width: `${b.pct}%` }}>
                  {b.pct > 14 ? b.label : ''}
                </span>
              ))}
            </div>
          ) : (
            <div className="ends">
              <span>{formatLegendValue(l.min, l.isTime)}</span>
              <span>{formatLegendValue(l.max, l.isTime)}</span>
            </div>
          )}
        </div>
      )}
      {l?.kind === 'categories' && (
        <div className="row-block">
          <div className="key">Colour</div>
          <div className="what">{columnLabel(l.column, null)}</div>
          <ul className="swatches">
            {l.items.map((it) => (
              <li key={it.label}>
                <span className="swatch" style={{ background: it.color }} />
                {it.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {s && (
        <div className="row-block">
          <div className="key">Size</div>
          <div className="what">{columnLabel(s.column, null)}</div>
          <div className="sizes">
            {sizeSamples(s.column, s.min, s.max).map((x) => (
              <span key={x.label}>
                <i style={{ width: x.px, height: x.px }} />
                {x.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {hudStore.geo && (
        <>
          <div className="row-block">
            <div className="key">Dot</div>
            <div className="what">
              where it happened{hudStore.xray ? ', at its real depth' : ' (epicentre)'}
            </div>
          </div>
          <button className={`xray-toggle ${hudStore.xray ? 'on' : ''}`} onClick={onToggleXray}>
            X-ray {hudStore.xray ? 'on' : 'off'} <kbd>X</kbd>
          </button>
          <p className="hint">X-ray turns the crust to glass so quakes sink to their true depth.</p>
        </>
      )}
    </section>
  );
}
