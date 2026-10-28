import { describe, expect, it } from 'vitest';
import type { CheckupAdvice, Identification } from '@plantcare/shared';
import { createFakePlantAi } from './plant-ai';

const identification: Identification = {
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

const advice: CheckupAdvice = {
  isPlant: true,
  matchesSpecies: true,
  problem: 'Too much water.',
  steps: ['Let the soil dry.'],
  whenToWorry: 'If the stems go soft.',
};

describe('createFakePlantAi', () => {
  it('answers from its script in order and records each call', async () => {
    const ai = createFakePlantAi({
      identify: [identification],
      checkup: [advice],
    });
    await expect(
      ai.identify({ name: 'zz', locale: 'en' }),
    ).resolves.toMatchObject({
      result: identification,
    });
    await expect(
      ai.checkup({
        photo: Buffer.from('x'),
        species: 'Zamioculcas zamiifolia',
        locale: 'en',
      }),
    ).resolves.toMatchObject({ result: advice });
    expect(ai.calls).toHaveLength(2);
  });

  it('throws when the script runs out, so a test never gets a silent default', async () => {
    const ai = createFakePlantAi({});
    await expect(ai.identify({ name: 'zz', locale: 'en' })).rejects.toThrow(
      'No scripted',
    );
  });
});
