import { z } from 'zod';

const UNSUPPORTED = new Set([
  '$schema',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'maxItems',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  return isRecord(node) ? cleanObject(node) : node;
}

function cleanObject(node: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED.has(key)) continue;
    // Structured outputs only take minItems of 0 or 1; zod still checks the real bound.
    if (key === 'minItems' && typeof value === 'number' && value > 1) continue;
    // zod writes unions as oneOf; structured outputs only take anyOf. The branches never overlap
    // (each has its own literal), so the two mean the same here.
    out[key === 'oneOf' ? 'anyOf' : key] = clean(value);
  }
  if (
    out.type === 'object' &&
    out.properties &&
    typeof out.properties === 'object'
  ) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties);
  }
  return out;
}

/**
 * The JSON schema sent as output_config.format. Length and range constraints the API rejects are
 * dropped here and enforced afterwards by parsing the answer with the same zod schema.
 */
export function toOutputSchema(schema: z.ZodType): Record<string, unknown> {
  return cleanObject({ ...z.toJSONSchema(schema) });
}
