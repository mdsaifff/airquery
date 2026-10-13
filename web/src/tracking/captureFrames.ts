// Captures labelled webcam frames for training a custom gesture (T5.5) and
// downloads them as <label>.tar, ready for the Model Maker notebook.
import { downloadBlob } from './recorder.ts';
import { makeTar } from './tar.ts';
import type { TarFile } from './tar.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function captureFrames(
  video: HTMLVideoElement,
  label: string,
  count: number,
  intervalMs: number,
  onProgress: (done: number) => void,
): Promise<void> {
  const safe = label.replace(/[^A-Za-z0-9_-]/g, '_') || 'gesture';
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas');
  const stamp = Date.now().toString(36);
  const files: TarFile[] = [];
  for (let i = 0; i < count; i++) {
    ctx.drawImage(video, 0, 0); // raw, unmirrored: what MediaPipe sees
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (blob) files.push({ name: `${safe}/${safe}_${stamp}_${String(i).padStart(3, '0')}.jpg`, data: new Uint8Array(await blob.arrayBuffer()) }); // prettier-ignore
    onProgress(i + 1);
    await sleep(intervalMs);
  }
  downloadBlob(
    `${safe}.tar`,
    new Blob([makeTar(files) as BlobPart], { type: 'application/x-tar' }),
  );
}
