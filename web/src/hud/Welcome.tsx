// First-visit welcome: what you're looking at and the three moves. Shown once
// (remembered in localStorage); closes on click, Esc/Enter, or when a hand shows up.
import { useCallback, useEffect, useState } from 'react';
import { hudStore, useTick } from './store.ts';

const KEY = 'airquery.welcomed';

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function Welcome() {
  useTick(4); // waits for the loading screen to finish
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

  if (!open || hudStore.loading.step < 3) return null;
  const n = hudStore.total;
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Welcome" onClick={close}>
      <div className="welcome-body" onClick={(e) => e.stopPropagation()}>
        <h1>Every dot is an earthquake.</h1>
        <p className="lede">
          {n > 0 ? `${n.toLocaleString()} of them` : 'All of them'}, magnitude 4.5 and up, recorded
          around the world in 2024. Steer the globe with your hands and ask questions out loud.
        </p>
        <ul className="steps">
          <li>
            <span className="emoji" aria-hidden="true">
              ☝
            </span>
            <b>Point</b> to read a quake
            <small>or move the mouse</small>
          </li>
          <li>
            <span className="emoji" aria-hidden="true">
              🤏
            </span>
            <b>Pinch and drag</b> to turn the globe
            <small>or drag; scroll to zoom</small>
          </li>
          <li>
            <span className="emoji" aria-hidden="true">
              ✌
            </span>
            <b>Hold a victory sign</b> and speak
            <small>or hold Space, or type</small>
          </li>
        </ul>
        <button className="primary" onClick={close} autoFocus>
          Start exploring
        </button>
      </div>
    </div>
  );
}
