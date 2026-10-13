// HTTP client for the agent. Every response is validated with zod before use;
// the type assertions below fail to compile if zod and the generated contract drift.
import { z } from 'zod';
import type {
  CompileRequest,
  QueryRequest,
  QueryResponse,
  QuerySpec,
} from '../contracts/contracts.ts';

const Scalar = z.union([z.number(), z.string()]);

const Filter = z.object({
  field: z.string(),
  op: z.enum(['=', '!=', '>', '>=', '<', '<=', 'between', 'in', 'contains', 'last_days']),
  value: z.union([Scalar, z.array(Scalar)]),
});

export const QuerySpecSchema = z.object({
  version: z.literal(1),
  dataset: z.string(),
  intent: z.enum(['query', 'navigate', 'undo', 'reset', 'explain']),
  mode: z.enum(['refine', 'replace']),
  filters: z.array(Filter),
  color_by: z.string().nullable(),
  size_by: z.string().nullable(),
  sort: z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) }).nullable(),
  limit: z.number().int().min(1).max(5000).nullable(),
  camera_target: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      label: z.string(),
    })
    .nullable(),
});

export const QueryResponseSchema = z.object({
  status: z.enum(['ok', 'clarify', 'rejected']),
  spec: QuerySpecSchema.nullable(),
  sql: z.string().nullable(),
  params: z.array(Scalar),
  message: z.string().nullable(),
  retries: z.number().int(),
  timings_ms: z.record(z.string(), z.number()),
});

// Compile-time drift checks against the generated contract types.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const specMatches: Same<z.infer<typeof QuerySpecSchema>, QuerySpec> = true;
const responseMatches: Same<z.infer<typeof QueryResponseSchema>, QueryResponse> = true;
void specMatches;
void responseMatches;

export const AGENT_URL: string =
  (import.meta.env.VITE_AGENT_URL as string | undefined) ?? 'http://localhost:8000';

async function post(path: string, req: unknown, baseUrl: string): Promise<QueryResponse> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const body: unknown = await res.json();
  return QueryResponseSchema.parse(body);
}

/** POST /query. Throws on network errors or a response that fails validation. */
export function askAgent(req: QueryRequest, baseUrl = AGENT_URL): Promise<QueryResponse> {
  return post('/query', req, baseUrl);
}

/** POST /compile (mouse baseline): a UI-built spec -> validated SQL, no LLM. */
export function compileSpec(req: CompileRequest, baseUrl = AGENT_URL): Promise<QueryResponse> {
  return post('/compile', req, baseUrl);
}
