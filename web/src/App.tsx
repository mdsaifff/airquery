import { useEffect, useRef, useState } from 'react';
import { config } from './config.ts';
import { BaselinePanel, TaskPanel } from './hud/BaselinePanels.tsx';
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
  const [tasksOpen, setTasksOpen] = useState(false);
  const [baseline, setBaseline] = useState(false);
  const [study] = useState(() => new StudyHost());

  useEffect(() => {
    if (!sceneRef.current || !camRef.current) return;
    const rt = startRuntime({ sceneEl: sceneRef.current, camCanvas: camRef.current, study });
    runtime.current = rt;
    return () => rt.dispose();
  }, [study]);

  useEffect(() => {
    runtime.current?.setBaseline(baseline);
  }, [baseline]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyD' && import.meta.env.DEV) setDebug((d) => !d);
      if (e.code === 'KeyG') setStudyOpen((s) => !s); // gesture study
      if (e.code === 'KeyT') setTasksOpen((s) => !s); // study task timer
      if (e.code === 'KeyB') {
        // mouse baseline: hands + voice off, dropdowns on
        setBaseline((b) => !b);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div ref={sceneRef} className="scene" />
      <canvas
        ref={camRef}
        className={baseline ? 'cam hidden' : 'cam'}
        width={config.cameraWidth / 2}
        height={config.cameraHeight / 2}
      />
      <GlassBox />
      <Stats />
      <div className="bottom-left">
        <Legend />
        {!baseline && <TranscriptBar onSubmit={(text) => runtime.current?.typed(text)} />}
      </div>
      <Toasts />
      {debug && <DebugPanel />}
      {studyOpen && <StudyPanel host={study} />}
      {baseline && (
        <BaselinePanel
          onApply={(spec) => runtime.current?.applySpec(spec)}
          onUndo={() => runtime.current?.undo()}
          onResetView={() => runtime.current?.resetView()}
        />
      )}
      {tasksOpen && <TaskPanel mode={baseline ? 'mouse' : 'hands'} />}
    </>
  );
}
