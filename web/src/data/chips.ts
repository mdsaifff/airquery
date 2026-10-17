// Suggestion chips: fixed specs per dataset (data/<name>.chips.json), applied through
// POST /compile, so they work without the LLM and never hit its rate limit.
import { z } from 'zod';
import type { QuerySpec } from '../contracts/contracts.ts';
import { QuerySpecSchema } from './agentClient.ts';
import { blankSpec } from './refine.ts';

const ChipSchema = z.object({
  label: z.string().min(1).max(24),
  pinned: z.boolean().optional(),
  spec: QuerySpecSchema.omit({ version: true, dataset: true }).partial(),
});
export const ChipsSchema = z.array(ChipSchema).min(1);
export type Chip = z.infer<typeof ChipSchema>;

export function chipSpec(chip: Chip, dataset: string): QuerySpec {
  return { ...blankSpec(dataset), ...chip.spec };
}

/** A random chip whose spec differs from what is on screen (any chip if none does). */
export function surprise(
  chips: Chip[],
  dataset: string,
  current: QuerySpec | null,
  rand: () => number = Math.random,
): Chip {
  const now = JSON.stringify(current);
  const fresh = chips.filter((c) => JSON.stringify(chipSpec(c, dataset)) !== now);
  const pool = fresh.length > 0 ? fresh : chips;
  return pool[Math.floor(rand() * pool.length) % pool.length];
}

/** The dataset's chips, or none (missing file, a dev server's HTML fallback, bad JSON). */
export async function loadChips(dataset: string): Promise<Chip[]> {
  try {
    const res = await fetch(new URL(`data/${dataset}.chips.json`, document.baseURI));
    if (!res.ok) return [];
    const parsed = ChipsSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
