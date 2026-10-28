import type { CheckupAdvice, Identification, Locale } from '@plantcare/shared';
import type { AiUsageTokens } from './cost';

export type IdentifyInput = { photo?: Buffer; name?: string; locale: Locale };
export type CheckupInput = {
  photo: Buffer;
  species: string;
  description?: string;
  locale: Locale;
};

/** Every model call the API makes goes through this, so tests can swap in a fake. */
export interface PlantAi {
  identify(
    input: IdentifyInput,
  ): Promise<{ result: Identification; usage: AiUsageTokens }>;
  checkup(
    input: CheckupInput,
  ): Promise<{ result: CheckupAdvice; usage: AiUsageTokens }>;
}

const FAKE_USAGE: AiUsageTokens = { inputTokens: 1000, outputTokens: 200 };

/** Answers from a script, in order, and records what it was asked. */
export function createFakePlantAi(script: {
  identify?: Identification[];
  checkup?: CheckupAdvice[];
}): PlantAi & { calls: (IdentifyInput | CheckupInput)[] } {
  const identify = [...(script.identify ?? [])];
  const checkup = [...(script.checkup ?? [])];
  const calls: (IdentifyInput | CheckupInput)[] = [];
  return {
    calls,
    identify(input) {
      calls.push(input);
      const result = identify.shift();
      if (!result) {
        return Promise.reject(new Error('No scripted identification left'));
      }
      return Promise.resolve({ result, usage: FAKE_USAGE });
    },
    checkup(input) {
      calls.push(input);
      const result = checkup.shift();
      if (!result)
        return Promise.reject(new Error('No scripted check-up left'));
      return Promise.resolve({ result, usage: FAKE_USAGE });
    },
  };
}
