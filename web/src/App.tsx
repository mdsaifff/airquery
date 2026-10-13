import { useEffect, useRef, useState } from 'react';
import { config } from './config.ts';
import { DebugPanel } from './hud/DebugPanel.tsx';
import { Toasts, TranscriptBar } from './hud/TranscriptBar.tsx';
import { metrics } from './hud/metrics.ts';
import { hudStore, useTick } from './hud/store.ts';
import { startRuntime } from './runtime.ts';
import type { Runtime } from './runtime.ts';

function Stats() {
  useTick();
  return (
    <div className="stats">
      <div>
        render {hudStore.renderFps.toFixed(0)} fps · {hudStore.frameMs.toFixed(1)} ms
      </div>
      <div>
        tracking {hudStore.trackingFps.toFixed(0)} fps · infer{' '}
        {metrics.inference.percentile(0.5).toFixed(1)} ms · gestures{' '}
        {metrics.gestures.percentile(0.5).toFixed(2)} ms · {hudStore.mode}
        {hudStore.listening && ' · listening'}
      </div>
      <div>
        {hudStore.shown.toLocaleString()} / {hudStore.total.toLocaleString()} quakes
        {hudStore.queryMs > 0 && ` · query ${hudStore.queryMs.toFixed(0)} ms`}
      </div>
      {hudStore.status && <div>{hudStore.status}</div>}
      {hudStore.cameraError && <div className="warn">{hudStore.cameraError}</div>}
    </div>
  );
}

export function App() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyD' && !(e.target instanceof HTMLInputElement)) setDebug((d) => !d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!sceneRef.current || !camRef.current) return;
    const rt = startRuntime({ sceneEl: sceneRef.current, camCanvas: camRef.current });
    runtime.current = rt;
    return () => rt.dispose();
  }, []);

  return (
    <>
      <div ref={sceneRef} className="scene" />
      <canvas
        ref={camRef}
        className="cam"
        width={config.cameraWidth / 2}
        height={config.cameraHeight / 2}
      />
      <Stats />
      {debug && <DebugPanel />}
      <TranscriptBar onSubmit={(text) => runtime.current?.typed(text)} />
      <Toasts />
    </>
  );
}
