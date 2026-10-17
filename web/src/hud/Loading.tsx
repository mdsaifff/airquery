// First visit: what is downloading, step by step, until the globe is ready. A seismic
// trace draws itself under the wordmark while it waits.
import { hudStore, useTick } from './store.ts';

const STEPS = ['Starting the data engine', 'Loading 6,397 earthquakes', 'Painting the globe'];

// A quiet line with one quake in it: seeded noise, swelling then decaying around x = 0.42.
const TRACE = (() => {
  let s = 11;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
  const pts: string[] = [];
  for (let i = 0; i <= 160; i++) {
    const x = i / 160;
    const quake = x < 0.42 ? Math.exp(-((x - 0.42) ** 2) / 0.0004) : Math.exp(-(x - 0.42) / 0.07);
    const swing = (i % 2 ? 1 : -1) * (0.35 + Math.abs(rand())); // alternating, like a real trace
    pts.push(`${(x * 320).toFixed(1)},${(20 + swing * (2 + 26 * quake)).toFixed(1)}`);
  }
  return pts.join(' ');
})();

export function Loading() {
  useTick(8);
  const { step, error } = hudStore.loading;
  if (step >= 3 && !error) return null;
  return (
    <div className="loading" role="status" aria-live="polite">
      <h1>AirQuery</h1>
      <svg className="trace" viewBox="0 0 320 40" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={TRACE} pathLength={1} />
      </svg>
      <ol>
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'done' : i === step && !error ? 'now' : ''}>
            {label}
          </li>
        ))}
      </ol>
      {error ? (
        <p className="err">
          {error} <button onClick={() => window.location.reload()}>Try again</button>
        </p>
      ) : (
        <p className="hint">The first visit downloads about 40 MB; later visits are instant.</p>
      )}
    </div>
  );
}
