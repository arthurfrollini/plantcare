import { describe, expect, it } from 'vitest';
import { pickTranslation } from './service';

const en = { locale: 'en', name: 'Snake plant' };
const pt = { locale: 'pt-BR', name: 'Espada São Jorge' };

describe('pickTranslation', () => {
  it('returns the exact locale when present', () => {
    expect(pickTranslation([en, pt], 'pt-BR')).toBe(pt);
    expect(pickTranslation([pt, en], 'en')).toBe(en);
  });

  it('falls back to English when the locale row is missing', () => {
    expect(pickTranslation([en], 'pt-BR')).toBe(en);
  });

  it('returns null when neither exists', () => {
    expect(pickTranslation([pt], 'en')).toBeNull();
    expect(pickTranslation([], 'pt-BR')).toBeNull();
  });
});
