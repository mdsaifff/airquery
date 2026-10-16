// Pure helpers for the "How to read this" card.

/** Sample dots for the size key; px grows like PointCloud.setSizes (t^1.5). */
export function sizeSamples(
  column: string,
  min: number,
  max: number,
): { label: string; px: number }[] {
  const values = column === 'magnitude' ? [5, 6, 7] : [min, (min + max) / 2, max];
  const span = max - min || 1;
  return values.map((v) => {
    const t = Math.min(1, Math.max(0, (v - min) / span));
    const label = column === 'magnitude' ? `M${v}` : String(Math.round(v * 100) / 100);
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
