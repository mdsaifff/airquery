import { compile } from 'json-schema-to-typescript';
import type { JSONSchema } from 'json-schema-to-typescript';

const BANNER = `// GENERATED from agent/spec.py via contracts.schema.json. Do not edit.
// Regenerate with \`make contracts\`.`;

/** Drop Pydantic's per-property titles so they don't become one type alias each. */
function stripPropertyTitles(node: unknown, isProperty = false): unknown {
  if (Array.isArray(node)) return node.map((n) => stripPropertyTitles(n, isProperty));
  if (typeof node !== 'object' || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'title' && isProperty) continue;
    if (k === 'properties' && typeof v === 'object' && v !== null) {
      out[k] = Object.fromEntries(
        Object.entries(v).map(([name, prop]) => [name, stripPropertyTitles(prop, true)]),
      );
    } else {
      out[k] = stripPropertyTitles(v, isProperty && (k === 'anyOf' || k === 'items'));
    }
  }
  return out;
}

export async function renderContracts(schema: JSONSchema): Promise<string> {
  return compile(stripPropertyTitles(schema) as JSONSchema, 'AirQueryContracts', {
    bannerComment: BANNER,
    additionalProperties: false,
    unreachableDefinitions: true,
    format: true,
    style: { singleQuote: true, printWidth: 100 },
  });
}
