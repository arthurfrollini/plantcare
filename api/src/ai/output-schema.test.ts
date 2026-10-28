import { checkupAdviceSchema, identificationSchema } from '@plantcare/shared';
import { describe, expect, it } from 'vitest';
import { toOutputSchema } from './output-schema';

type Node = Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function walk(node: unknown, visit: (n: Node) => void): void {
  if (Array.isArray(node)) node.forEach((child) => walk(child, visit));
  else if (isNode(node)) {
    visit(node);
    Object.values(node).forEach((child) => walk(child, visit));
  }
}

describe('toOutputSchema', () => {
  it.each([
    ['identification', identificationSchema],
    ['check-up advice', checkupAdviceSchema],
  ])('turns the %s schema into one structured outputs accepts', (_, schema) => {
    const json = toOutputSchema(schema);
    walk(json, (node) => {
      for (const key of [
        'minLength',
        'maxLength',
        'minimum',
        'maximum',
        'maxItems',
        '$schema',
        'oneOf',
      ]) {
        expect(node).not.toHaveProperty(key);
      }
      if (typeof node.minItems === 'number')
        expect(node.minItems).toBeLessThanOrEqual(1);
      if (node.type === 'object') {
        expect(node.additionalProperties).toBe(false);
        expect(isNode(node.properties)).toBe(true);
        if (isNode(node.properties)) {
          expect(node.required).toEqual(Object.keys(node.properties));
        }
      }
    });
  });

  it('keeps the frequency union as anyOf, the form structured outputs takes', () => {
    const json = toOutputSchema(identificationSchema);
    const properties = isNode(json.properties) ? json.properties : {};
    const frequency = properties.frequency;
    expect(isNode(frequency) && Array.isArray(frequency.anyOf)).toBe(true);
  });
});
