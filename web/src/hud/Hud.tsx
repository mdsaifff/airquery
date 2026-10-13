// HUD panels laid out for a 1080p screen recording: glass box top-left, stats
// top-right, legend + transcript bottom-left, webcam bottom-right.
import { RAMP_CSS } from '../scene/colorRamp.ts';
import { formatLegendValue, formatMs, prettySpec, prettySql } from './format.ts';
import { metrics } from './metrics.ts';
import { hudStore, useTick } from './store.ts';

export function GlassBox() {
  useTick(4);
  const { spec, sql, params } = hudStore.glass;
  const t = hudStore.timings;
  return (
    <section className="panel glass" aria-label="Query glass box">
      <h2>
        AirQuery <span className="sub">what ran</span>
        {hudStore.thinking && <span className="thinking"> · thinking…</span>}
      </h2>
      <div className="label">spec</div>
      <pre>{prettySpec(spec)}</pre>
      <div className="label">sql</div>
      <pre className="sql">{sql ? prettySql(sql) : 'SELECT * FROM quakes'}</pre>
      {params.length > 0 && <pre className="params">params {JSON.stringify(params)}</pre>}
      {t.total !== undefined && (
        <div className="timings">
          {t.llm === undefined
            ? `cached reply · agent ${formatMs(t.total)}`
            : `llm ${formatMs(t.llm)} · validate ${formatMs(t.validate ?? 0)} · compile ${formatMs(t.compile ?? 0)}`}
          {` · duckdb ${formatMs(hudStore.queryMs)}`}
        </div>
      )}
    </section>
  );
}

export function Stats() {
  useTick();
  return (
    <div className="stats">
      <div>
        render <b>{hudStore.renderFps.toFixed(0)}</b> fps · tracking{' '}
        <b>{hudStore.trackingFps.toFixed(0)}</b> fps
      </div>
      <div>
        voice→render <b>{formatMs(hudStore.latencyMs)}</b>
        {metrics.voiceToRender.count > 1 &&
          ` (median ${formatMs(metrics.voiceToRender.percentile(0.5))})`}
      </div>
      <div>
        {hudStore.shown.toLocaleString()} / {hudStore.total.toLocaleString()} quakes ·{' '}
        {hudStore.mode}
      </div>
      {hudStore.status && <div>{hudStore.status}</div>}
      {hudStore.cameraError && <div className="warn">{hudStore.cameraError}</div>}
    </div>
  );
}

export function Legend() {
  useTick(4);
  const l = hudStore.legend;
  if (!l) return null;
  return (
    <div className="panel legend" aria-label={`Colour: ${l.column}`}>
      <div className="label">
        colour: {l.column}
        {l.unit && !l.isTime && l.unit !== l.column ? ` (${l.unit})` : ''}
      </div>
      <div className="ramp" style={{ background: RAMP_CSS }} />
      <div className="ends">
        <span>{formatLegendValue(l.min, l.isTime)}</span>
        <span>{formatLegendValue(l.max, l.isTime)}</span>
      </div>
    </div>
  );
}
