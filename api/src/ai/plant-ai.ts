import type { CheckupAdvice, Identification, Locale } from '@plantcare/shared';
import { z } from 'zod';
import type { AiUsageTokens } from './cost';

export type IdentifyInput = { photo?: Buffer; name?: string; locale: Locale };
export type CheckupInput = {
  photo: Buffer;
  species: string;
  description?: string;
  locale: Locale;
};

export type SpeciesPhotoInput = { photo: Buffer; scientificName: string };

/** Whether a photo picked from Commons can illustrate the species in the catalog. */
export const speciesPhotoCheckSchema = z.object({
  suitable: z.boolean(),
  reason: z.string(),
});
export type SpeciesPhotoCheck = z.infer<typeof speciesPhotoCheckSchema>;

/**
 * What the model may send when the photo shows no plant, or another species: it is told to fill
 * the other fields anyway, but placeholders such as an empty name would fail the full schema.
 */
export type NotAPlant = { isPlant: false };
export type OtherSpecies = { isPlant: true; matchesSpecies: false };

/** Every model call the API makes goes through this, so tests can swap in a fake. */
export interface PlantAi {
  identify(
    input: IdentifyInput,
  ): Promise<{ result: Identification | NotAPlant; usage: AiUsageTokens }>;
  checkup(input: CheckupInput): Promise<{
    result: CheckupAdvice | NotAPlant | OtherSpecies;
    usage: AiUsageTokens;
  }>;
  checkSpeciesPhoto(
    input: SpeciesPhotoInput,
  ): Promise<{ result: SpeciesPhotoCheck; usage: AiUsageTokens }>;
}

const FAKE_USAGE: AiUsageTokens = { inputTokens: 1000, outputTokens: 200 };

type Scripted<T> = T | Error;

/** Answers from a script, in order, and records what it was asked. An Error in the script is thrown. */
export function createFakePlantAi(script: {
  identify?: Scripted<Identification | NotAPlant>[];
  checkup?: Scripted<CheckupAdvice | NotAPlant | OtherSpecies>[];
  speciesPhoto?: Scripted<SpeciesPhotoCheck>[];
}): PlantAi & {
  calls: (IdentifyInput | CheckupInput | SpeciesPhotoInput)[];
} {
  const identify = [...(script.identify ?? [])];
  const checkup = [...(script.checkup ?? [])];
  const speciesPhoto = [...(script.speciesPhoto ?? [])];
  const calls: (IdentifyInput | CheckupInput | SpeciesPhotoInput)[] = [];
  return {
    calls,
    identify(input) {
      calls.push(input);
      const result = identify.shift();
      if (!result) {
        return Promise.reject(new Error('No scripted identification left'));
      }
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve({ result, usage: FAKE_USAGE });
    },
    checkup(input) {
      calls.push(input);
      const result = checkup.shift();
      if (!result)
        return Promise.reject(new Error('No scripted check-up left'));
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve({ result, usage: FAKE_USAGE });
    },
    checkSpeciesPhoto(input) {
      calls.push(input);
      const result = speciesPhoto.shift();
      if (!result)
        return Promise.reject(new Error('No scripted photo check left'));
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve({ result, usage: FAKE_USAGE });
    },
  };
}
