import { describe, expect, it } from 'vitest';
import {
  checkupAdviceSchema,
  findHarmfulAdvice,
  identificationSchema,
  identifyResponseSchema,
} from './ai';

const identification = {
  isPlant: true,
  confidence: 'high',
  scientificName: 'Zamioculcas zamiifolia',
  names: { en: 'ZZ plant', 'pt-BR': 'Zamioculca' },
  about: { en: 'Glossy leaves.', 'pt-BR': 'Folhas brilhantes.' },
  waterTips: { en: 'Let it dry.', 'pt-BR': 'Deixe secar.' },
  light: 'partial_shade',
  difficulty: 'easy',
  frequency: { times: 1, per: 'twoWeeks' },
};

const advice = {
  isPlant: true,
  matchesSpecies: true,
  problem: 'Too much water.',
  steps: ['Let the soil dry.'],
  whenToWorry: 'If the stems go soft.',
};

describe('findHarmfulAdvice', () => {
  it.each([
    ['Sprinkle some salt on the soil', 'salt'],
    ['Use bleach to clean the leaves', 'bleach'],
    ['A spoon of VINEGAR in the water', 'vinegar'],
    ['Water it with sugar water', 'sugar'],
    ['Wipe with rubbing alcohol', 'alcohol'],
    ['Pour motor oil on the pests', 'motor oil'],
    ['Spray an insecticide', 'insecticide'],
    ['Use a pesticide', 'pesticide'],
    ['Coloque sal na terra', 'sal'],
    ['Use água sanitária', 'água sanitária'],
    ['Um pouco de vinagre', 'vinagre'],
    ['Agua com acucar', 'açúcar'],
    ['Passe álcool nas folhas', 'álcool'],
    ['Aplique inseticida', 'inseticida'],
  ])('flags "%s"', (text, term) => {
    expect(findHarmfulAdvice(text)).toBe(term);
  });

  it.each([
    'Wipe with water and a few drops of mild liquid soap',
    'Use água com algumas gotas de sabão neutro',
    'Move it to a salty sea breeze spot', // "salty" is not the word "salt"
    'Deixe a terra secar e salve as folhas verdes', // "salve" is not "sal"
  ])('lets "%s" through', (text) => {
    expect(findHarmfulAdvice(text)).toBeNull();
  });
});

describe('identificationSchema', () => {
  it('accepts a full identification', () => {
    expect(identificationSchema.parse(identification)).toEqual(identification);
  });

  it('rejects a light value outside the catalog', () => {
    expect(() =>
      identificationSchema.parse({ ...identification, light: 'darkness' }),
    ).toThrow();
  });
});

describe('checkupAdviceSchema', () => {
  it('accepts one to five steps', () => {
    expect(checkupAdviceSchema.parse(advice).steps).toHaveLength(1);
    expect(
      checkupAdviceSchema.parse({ ...advice, steps: ['a', 'b', 'c', 'd', 'e'] })
        .steps,
    ).toHaveLength(5);
  });

  it('rejects no steps or more than five', () => {
    expect(() => checkupAdviceSchema.parse({ ...advice, steps: [] })).toThrow();
    expect(() =>
      checkupAdviceSchema.parse({
        ...advice,
        steps: ['a', 'b', 'c', 'd', 'e', 'f'],
      }),
    ).toThrow();
  });
});

describe('identifyResponseSchema', () => {
  it('accepts a proposal and a not-a-plant answer', () => {
    expect(
      identifyResponseSchema.parse({
        kind: 'proposal',
        proposalId: 'p1',
        proposal: identification,
      }).kind,
    ).toBe('proposal');
    expect(
      identifyResponseSchema.parse({ kind: 'none', reason: 'not_a_plant' })
        .kind,
    ).toBe('none');
  });
});
