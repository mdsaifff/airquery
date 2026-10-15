import { useCallback, useEffect, useRef, useState } from 'react';
import type { CsvMapping } from './data/csvSchema.ts';
import type { CsvImport } from './scene/loadCsv.ts';
import { config } from './config.ts';
import { BaselinePanel, TaskPanel } from './hud/BaselinePanels.tsx';
import { CapturePanel } from './hud/CapturePanel.tsx';
import { CsvDrop } from './hud/CsvPanel.tsx';
import { DebugPanel } from './hud/DebugPanel.tsx';
import { GlassBox, Legend, Stats } from './hud/Hud.tsx';
import { StudyPanel } from './hud/StudyPanel.tsx';
import { Toasts, TranscriptBar } from './hud/TranscriptBar.tsx';
import { VoicePanel } from './hud/VoicePanel.tsx';
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
  const [captureOpen, setCaptureOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [baseline, setBaseline] = useState(false);
  const [study] = useState(() => new StudyHost());
  const importCsv = useCallback((file: File) => {
    if (!runtime.current) return Promise.reject(new Error('still starting'));
    return runtime.current.importCsv(file);
  }, []);
  const capture = useCallback(
    (label: string, onProgress: (n: number) => void) =>
      runtime.current?.captureGesture(label, onProgress) ?? Promise.reject(new Error('still starting')), // prettier-ignore
    [],
  );
  const finishCsv = useCallback(
    (imp: CsvImport, mapping: CsvMapping) => runtime.current?.finishCsv(imp, mapping) ?? Promise.resolve(), // prettier-ignore
    [],
  );

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
      if (e.code === 'KeyC') setCaptureOpen((s) => !s); // custom gesture data
      if (e.code === 'KeyV') setVoiceOpen((s) => !s); // voice picker
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
      <CsvDrop importCsv={importCsv} finishCsv={finishCsv} />
      {captureOpen && <CapturePanel capture={capture} />}
      {voiceOpen && <VoicePanel />}
    </>
  );
}
