import { useEffect, useRef } from 'react';
import { config } from './config.ts';
import { hudStore, useTick } from './hud/store.ts';
import { startRuntime } from './runtime.ts';

function Stats() {
  useTick();
  return (
    <div className="stats">
      <div>
        render {hudStore.renderFps.toFixed(0)} fps · {hudStore.frameMs.toFixed(1)} ms
      </div>
      <div>tracking {hudStore.trackingFps.toFixed(0)} fps</div>
      <div>
        {hudStore.shown.toLocaleString()} / {hudStore.total.toLocaleString()} quakes
      </div>
      {hudStore.status && <div>{hudStore.status}</div>}
      {hudStore.cameraError && <div className="warn">{hudStore.cameraError}</div>}
    </div>
  );
}

export function App() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!sceneRef.current || !camRef.current) return;
    return startRuntime({ sceneEl: sceneRef.current, camCanvas: camRef.current });
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
    </>
  );
}
