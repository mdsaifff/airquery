// First-visit welcome: what you're looking at and the three moves. Shown once
// (remembered in localStorage); closes on click, Esc/Enter, or when a hand shows up.
import { useCallback, useEffect, useState } from 'react';
import { hudStore } from './store.ts';

const KEY = 'airquery.welcomed';

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function Welcome() {
  const [open, setOpen] = useState(() => !seen());
  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // storage blocked: it shows again next visit
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    // A hand is up: they're already exploring.
    const id = setInterval(() => {
      if (hudStore.mode !== 'idle') close();
    }, 250);
    return () => clearInterval(id);
  }, [open, close]);

  if (!open) return null;
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Welcome" onClick={close}>
      <div className="welcome-card panel" onClick={(e) => e.stopPropagation()}>
        <h1>AirQuery</h1>
        <p className="lede">
          Every glowing dot is a 2024 earthquake of magnitude 4.5 or more. Steer the globe with your
          hands and ask questions out loud.
        </p>
        <ol className="steps">
          <li>
            <span className="emoji">☝</span>
            <b>Point</b> to inspect a quake
            <small>or move the mouse</small>
          </li>
          <li>
            <span className="emoji">🤏</span>
            <b>Pinch &amp; drag</b> to rotate
            <small>or drag; scroll to zoom</small>
          </li>
          <li>
            <span className="emoji">✌</span>
            <b>Hold</b> and speak to ask
            <small>or hold Space, or type</small>
          </li>
        </ol>
        <button className="primary" onClick={close}>
          Start exploring
        </button>
      </div>
    </div>
  );
}
