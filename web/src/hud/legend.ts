// Pure helpers for the "How to read this" card.
import { isLogScale, rampPosition } from '../scene/colorRamp.ts';

/** Sample dots for the size key; px grows like PointCloud.setSizes (t^1.5, log for wide data). */
export function sizeSamples(
  column: string,
  min: number,
  max: number,
): { label: string; px: number }[] {
  const middle = isLogScale(min, max) ? Math.sqrt(min * max) : (min + max) / 2;
  const values = column === 'magnitude' ? [5, 6, 7] : [min, middle, max];
  return values.map((v) => {
    const t = rampPosition(v, min, max);
    const label = column === 'magnitude' ? `M${v}` : String(Number(v.toPrecision(3)));
    return { label, px: Math.round(6 + t ** 1.5 * 18) };
  });
}

/** Shallow / intermediate / deep as widths (%) of a depth ramp over [min, max] km. */
export function depthBands(min: number, max: number): { label: string; pct: number }[] {
  const span = max - min || 1;
  const at = (km: number) => Math.min(100, Math.max(0, ((km - min) / span) * 100));
  return [
    { label: 'shallow', pct: at(70) },
    { label: 'intermediate', pct: at(300) - at(70) },
    { label: 'deep', pct: 100 - at(300) },
  ];
}

/** The earthquake depth bands (shallow < 70 km < intermediate < 300 km < deep) only mean
 *  something for data that goes that deep; deep-sea corals (1–6 km) get plain numbers. */
export function showDepthBands(_min: number, max: number): boolean {
  return max > 300;
}

/** Numbers under the depth ramp: the ends plus the shallow/intermediate/deep borders. */
export function depthTicks(min: number, max: number): { label: string; pct: number }[] {
  const span = max - min || 1;
  const at = (km: number) => Math.min(100, Math.max(0, ((km - min) / span) * 100));
  const inner = [70, 300].filter((km) => km > min && km < max);
  return [
    { label: String(Math.round(min)), pct: 0 },
    ...inner.map((km) => ({ label: String(km), pct: at(km) })),
    { label: `${Math.round(max)} km`, pct: 100 },
  ];
}
