// Pure sequential colour ramp (plasma, minus its darkest end so it reads on black).
export const RAMP_STOPS = ['#5c01a6', '#9c179e', '#cc4778', '#ed7953', '#fdb42f', '#f0f921'];

const RGB = RAMP_STOPS.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));

/** t in 0..1 (clamped) -> [r, g, b] in 0..1, written into out at offset. */
export function rampColor(t: number, out: Float32Array | number[], offset = 0): void {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (RGB.length - 1);
  const i = Math.min(RGB.length - 2, Math.floor(x));
  const f = x - i;
  for (let c = 0; c < 3; c++) out[offset + c] = RGB[i][c] + (RGB[i + 1][c] - RGB[i][c]) * f;
}

/** CSS gradient matching the ramp, for legends. */
export const RAMP_CSS = `linear-gradient(to right, ${RAMP_STOPS.join(', ')})`;

// Categorical: reference data-viz palette slots 1-3, dark-surface steps (validated
// all-pairs for scatter-like marks). Past three categories, the rest fold to grey.
export const CATEGORY_HEX = ['#3987e5', '#d95926', '#199e70'];
export const OTHER_HEX = '#6b7280';
const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
export const CATEGORY_COLORS = CATEGORY_HEX.map(hexRgb);
export const OTHER_COLOR = hexRgb(OTHER_HEX);
