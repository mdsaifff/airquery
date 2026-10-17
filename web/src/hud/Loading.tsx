// First visit: what is downloading, step by step, until the globe is ready.
import { hudStore, useTick } from './store.ts';

const STEPS = ['Starting the data engine', 'Loading 6,397 earthquakes', 'Painting the globe'];

export function Loading() {
  useTick(8);
  const { step, error } = hudStore.loading;
  if (step >= 3 && !error) return null;
  return (
    <div className="loading" role="status" aria-live="polite">
      <h1>AirQuery</h1>
      <ol>
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'done' : i === step ? 'now' : ''}>
            {i < step ? '✓' : i === step ? '…' : '·'} {label}
          </li>
        ))}
      </ol>
      {error ? (
        <p className="err">
          {error} <button onClick={() => window.location.reload()}>Retry</button>
        </p>
      ) : (
        <p className="hint">The first visit downloads about 40 MB; later visits are instant.</p>
      )}
    </div>
  );
}
