import { useEffect, useRef, useState } from 'react';
import { config } from './config.ts';
import { DebugPanel } from './hud/DebugPanel.tsx';
import { GlassBox, Legend, Stats } from './hud/Hud.tsx';
import { Toasts, TranscriptBar } from './hud/TranscriptBar.tsx';
import { startRuntime } from './runtime.ts';
import type { Runtime } from './runtime.ts';

export function App() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    if (!sceneRef.current || !camRef.current) return;
    const rt = startRuntime({ sceneEl: sceneRef.current, camCanvas: camRef.current });
    runtime.current = rt;
    return () => rt.dispose();
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyD' && !(e.target instanceof HTMLInputElement)) setDebug((d) => !d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      <GlassBox />
      <Stats />
      <div className="bottom-left">
        <Legend />
        <TranscriptBar onSubmit={(text) => runtime.current?.typed(text)} />
      </div>
      <Toasts />
      {debug && <DebugPanel />}
    </>
  );
}
