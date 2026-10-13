import { useEffect, useRef } from 'react';
import { config } from './config.ts';
import { hudStore, useTick } from './hud/store.ts';
import { startRuntime } from './runtime.ts';

function Stats() {
  useTick();
  return (
    <div className="stats">
      <div>tracking {hudStore.trackingFps.toFixed(0)} fps</div>
      {hudStore.cameraError && <div className="warn">{hudStore.cameraError}</div>}
    </div>
  );
}

export function App() {
  const camRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!camRef.current) return;
    return startRuntime({ camCanvas: camRef.current });
  }, []);

  return (
    <>
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
