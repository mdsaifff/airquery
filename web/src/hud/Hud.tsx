// HUD pieces laid out for a 1080p screen recording: what ran under the masthead
// (left rail), stats top-right, legend + seismogram + talk bar bottom-left, webcam
// bottom-right.
import { useState } from 'react';
import { RAMP_CSS } from '../scene/colorRamp.ts';
import { highlightSpec, highlightSql } from './highlight.ts';
import type { Token } from './highlight.ts';
import { depthBands, sizeSamples } from './legend.ts';
import { formatLegendValue, formatMs, prettySpec, prettySql } from './format.ts';
import { debugMode } from './debug.ts';
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
    <section className="glass" aria-label="What ran">
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
  if (!debugMode && !hudStore.status && !hudStore.cameraError) return null;
  return (
    <div className="stats">
      {debugMode && (
        <>
          <span>
            <b>{hudStore.renderFps.toFixed(0)}</b> fps
          </span>
          <span>
            hands <b>{hudStore.trackingFps.toFixed(0)}</b> fps
          </span>
          <span>
            voice to render <b>{formatMs(hudStore.latencyMs)}</b>
            {metrics.voiceToRender.count > 1 &&
              `, median ${formatMs(metrics.voiceToRender.percentile(0.5))}`}
          </span>
        </>
      )}
      {hudStore.status && <span className="status">{hudStore.status}</span>}
      {hudStore.cameraError && <span className="warn">{hudStore.cameraError}</span>}
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
    <section className="legend" aria-label="How to read the globe">
      {l?.kind === 'ramp' && (
        <>
          <div className="key">Colour</div>
          <div className="val">
            {columnLabel(l.column, l.unit)}
            <div className="ramp" style={{ background: RAMP_CSS }} />
            {isDepth ? (
              <div className="bands">
                {depthBands(l.min, l.max).map((b, i) => (
                  <span key={b.label} style={{ width: `${b.pct}%` }}>
                    {b.pct > 14 || i === 0 ? b.label : ''}
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
        </>
      )}
      {l?.kind === 'categories' && (
        <>
          <div className="key">Colour</div>
          <div className="val">
            {columnLabel(l.column, null)}
            <ul className="swatches">
              {l.items.map((it) => (
                <li key={it.label}>
                  <span className="swatch" style={{ background: it.color }} />
                  {it.label}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {s && (
        <>
          <div className="key">Size</div>
          <div className="val sizes">
            {columnLabel(s.column, null)}
            {sizeSamples(s.column, s.min, s.max).map((x) => (
              <span key={x.label}>
                <i style={{ width: x.px, height: x.px }} />
                {x.label}
              </span>
            ))}
          </div>
        </>
      )}
      {hudStore.geo && (
        <>
          <div className="key">Place</div>
          <div className="val">
            {hudStore.xray ? 'where and how deep it happened' : 'where it happened, on the surface'}
          </div>
          <div className="key" />
          <div className="val">
            <button
              className={`xray-toggle ${hudStore.xray ? 'on' : ''}`}
              onClick={onToggleXray}
              aria-pressed={hudStore.xray}
            >
              <span className="switch" aria-hidden="true" />
              X-ray <kbd>X</kbd>
            </button>
            <p className="hint">Turns the crust to glass so each quake sinks to its real depth.</p>
          </div>
        </>
      )}
    </section>
  );
}
