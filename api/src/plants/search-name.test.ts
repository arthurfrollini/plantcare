import { describe, expect, it } from 'vitest';
import { toSearchName } from './search-name';

describe('toSearchName', () => {
  it('lowercases and strips accents', () => {
    expect(toSearchName('Espada São Jorge')).toBe('espada sao jorge');
    expect(toSearchName('  ORQUÍDEA ')).toBe('orquidea');
  });

  it('turns hyphens into spaces and collapses whitespace', () => {
    expect(toSearchName('aninga-pará')).toBe('aninga para');
    expect(toSearchName('planta   da  - fortuna')).toBe('planta da fortuna');
  });
});
