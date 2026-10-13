import { config } from '../config.ts';

/** Starts the webcam into a detached <video>. Rejects if permission is denied. */
export async function startCamera(): Promise<HTMLVideoElement> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: config.cameraWidth, height: config.cameraHeight, facingMode: 'user' },
    audio: false,
  });
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  return video;
}
