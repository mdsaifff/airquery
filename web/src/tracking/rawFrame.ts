// MediaPipe-shaped hand data. This is what the recorder saves as fixtures.
// Coordinates are MediaPipe's normalized, *unmirrored* image coords (0..1).
// Only src/tracking/ may read these; everything else uses HandsFrame (geometry.ts).

export interface RawLandmark {
  x: number;
  y: number;
  z: number;
}

export interface RawHand {
  /** MediaPipe's label, which assumes a mirrored (selfie) image. */
  handedness: 'Left' | 'Right';
  landmarks: RawLandmark[];
  /** Built-in gesture label, e.g. 'Pointing_Up', 'None'. */
  gesture: string;
  gestureScore: number;
}

export interface RawFrame {
  /** performance.now() timestamp (ms) of the video frame. */
  t: number;
  hands: RawHand[];
}
