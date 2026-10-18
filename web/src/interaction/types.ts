// Gesture event contract (docs/ARCHITECTURE.md).

export type Hand = 'left' | 'right';
/** explain: the custom gesture trained with MediaPipe Model Maker (stretch, T5.5).
 *  circle: a pinch held still (shows a ring). */
export type HoldGesture = 'reset' | 'explain' | 'circle';

export type GestureEvent =
  | { kind: 'cursor'; x: number; y: number } // screen px
  | { kind: 'pinchStart' | 'pinchMove' | 'pinchEnd'; hand: Hand; x: number; y: number }
  | { kind: 'twoHandZoom'; scaleDelta: number } // ratio vs. previous frame
  | { kind: 'holdProgress'; gesture: HoldGesture; progress: number } // 0..1
  | { kind: 'fire'; gesture: HoldGesture }
  | { kind: 'clutch'; active: boolean }
  /** Listening on/off; x, y (screen px) is where the pointing finger rests ("here"). */
  | { kind: 'talk'; active: boolean; x?: number; y?: number }
  /** A second hand is coming up beside a pointing one: talk is likely, warm up the mic. */
  | { kind: 'talkPrime'; active: boolean }
  | { kind: 'swipe'; direction: 'left' | 'right' } // switch scene
  /** A pinch held still: the centre of a circle selection (screen px). */
  | { kind: 'circleHold'; hand: Hand; x: number; y: number }
  | { kind: 'handsLost' };
