import { useEffect, useRef, useState } from 'react';
import { config } from './config.ts';
import { DebugPanel } from './hud/DebugPanel.tsx';
import { GlassBox, Legend, Stats } from './hud/Hud.tsx';
import { StudyPanel } from './hud/StudyPanel.tsx';
import { Toasts, TranscriptBar } from './hud/TranscriptBar.tsx';
import { StudyHost } from './interaction/study.ts';
import { startRuntime } from './runtime.ts';
import type { Runtime } from './runtime.ts';

export function App() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const [debug, setDebug] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const [study] = useState(() => new StudyHost());

  useEffect(() => {
    if (!sceneRef.current || !camRef.current) return;
    const rt = startRuntime({ sceneEl: sceneRef.current, camCanvas: camRef.current, study });
    runtime.current = rt;
    return () => rt.dispose();
  }, [study]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyD' && import.meta.env.DEV) setDebug((d) => !d);
      if (e.code === 'KeyG') setStudyOpen((s) => !s); // gesture study
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
      {studyOpen && <StudyPanel host={study} />}
    </>
  );
}
