import { describe, expect, it } from 'vitest';
import { resolveLocale } from './i18n';

describe('resolveLocale', () => {
  it.each([
    ['pt-BR,pt;q=0.9,en;q=0.8', 'pt-BR'],
    ['pt', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    ['fr-FR', 'en'],
    [undefined, 'en'],
    ['', 'en'],
    ['en;q=0.5,pt-BR;q=0.9', 'pt-BR'],
    ['en-US,en;q=0.9', 'en'],
    ['fr,pt;q=0.5', 'pt-BR'],
  ] as const)('%s -> %s', (header, expected) => {
    expect(resolveLocale(header)).toBe(expected);
  });
});
