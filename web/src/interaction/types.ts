// Gesture event contract (docs/ARCHITECTURE.md).

export type Hand = 'left' | 'right';
/** explain: the custom gesture trained with MediaPipe Model Maker (stretch, T5.5). */
export type HoldGesture = 'reset' | 'undo' | 'explain';

export type GestureEvent =
  | { kind: 'cursor'; x: number; y: number } // screen px
  | { kind: 'pinchStart' | 'pinchMove' | 'pinchEnd'; hand: Hand; x: number; y: number }
  | { kind: 'twoHandZoom'; scaleDelta: number } // ratio vs. previous frame
  | { kind: 'holdProgress'; gesture: HoldGesture; progress: number } // 0..1
  | { kind: 'fire'; gesture: HoldGesture }
  | { kind: 'clutch'; active: boolean }
  | { kind: 'talk'; active: boolean }
  | { kind: 'swipe'; direction: 'left' | 'right' } // switch scene
  | { kind: 'lasso'; active: boolean } // 🤟 held: trace a loop with the index finger
  | { kind: 'handsLost' };
