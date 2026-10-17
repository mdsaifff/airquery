// Pure: a view (spec, camera, X-ray, time machine day) <-> a URL hash, '#v=<base64url JSON>'.
// Decoding validates with zod; anything malformed is null, never an exception.
import { z } from 'zod';
import { QuerySpecSchema } from './data/agentClient.ts';

const MAX_HASH = 4000;

const ShareSchema = z.object({
  v: z.literal(1),
  dataset: z.string().min(1).max(64),
  spec: QuerySpecSchema.nullable(),
  orbit: z.object({
    yaw: z.number().finite(),
    pitch: z.number().min(-1.6).max(1.6),
    distance: z.number().min(0.5).max(20),
  }),
  xray: z.boolean(),
  day: z.number().min(0).max(4000).nullable(),
});
export type ShareState = z.infer<typeof ShareSchema>;

export function encodeShare(s: ShareState): string {
  let bin = '';
  for (const b of new TextEncoder().encode(JSON.stringify(s))) bin += String.fromCharCode(b);
  return `#v=${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function decodeShare(hash: string): ShareState | null {
  if (hash.length > MAX_HASH) return null;
  const m = /^#v=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const parsed = ShareSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
