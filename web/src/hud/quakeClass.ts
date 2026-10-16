// Pure: USGS magnitude classes and the usual depth bands.
export type MagnitudeClass = 'Minor' | 'Light' | 'Moderate' | 'Strong' | 'Major' | 'Great';

export function magnitudeClass(m: number): MagnitudeClass {
  if (m >= 8) return 'Great';
  if (m >= 7) return 'Major';
  if (m >= 6) return 'Strong';
  if (m >= 5) return 'Moderate';
  if (m >= 4) return 'Light';
  return 'Minor';
}

export function depthClass(km: number): 'Shallow' | 'Intermediate' | 'Deep' {
  if (km < 70) return 'Shallow';
  return km <= 300 ? 'Intermediate' : 'Deep';
}

/** Depth gauge full scale (km): the deepest quakes are ~700 km. */
export const DEPTH_GAUGE_MAX_KM = 700;
