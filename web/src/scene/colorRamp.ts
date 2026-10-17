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

/** Positive data spanning 1000x or more (meteorite masses, 0.00001 to 60 000 kg) goes
 *  logarithmic, else nothing but the few giants would stand out. */
export const isLogScale = (min: number, max: number) => min > 0 && max / min >= 1000;

/** Where v sits on a colour or size scale over [min, max] (0..1), see isLogScale. */
export function rampPosition(v: number, min: number, max: number): number {
  const t = isLogScale(min, max)
    ? Math.log(v / min) / Math.log(max / min)
    : (v - min) / (max - min || 1);
  return Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
}

/** CSS gradient matching the ramp, for legends. */
export const RAMP_CSS = `linear-gradient(to right, ${RAMP_STOPS.join(', ')})`;

/** Up to 8 categories get their own colour (star classes, meteorite kinds); the rest are "other". */
export const CATEGORY_HEX = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#e6b800',
  '#a855f7',
  '#ec4899',
  '#22d3ee',
  '#84cc16',
];
export const OTHER_HEX = '#6b7280';
const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
export const CATEGORY_COLORS = CATEGORY_HEX.map(hexRgb);
export const OTHER_COLOR = hexRgb(OTHER_HEX);
