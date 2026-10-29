import type { PrismaClient } from '../generated/prisma/client';
import type { CheckSpeciesPhoto } from './commons';
import type { PlantAi } from './plant-ai';
import { countFailedAnswer, recordAiUsage } from './usage';

/**
 * Asks the model whether a Commons photo shows the species, for the user whose add created it.
 * Each check counts towards the day's spend, not the user's daily limits. Without a model, no
 * photo passes.
 */
export function speciesPhotoCheck(options: {
  prisma: PrismaClient;
  ai: PlantAi | undefined;
  userId: string;
  scientificName: string;
  log: (message: string) => void;
}): CheckSpeciesPhoto {
  const { prisma, ai, userId, scientificName, log } = options;
  return async (photo) => {
    if (!ai) return false;
    const { result, usage } = await countFailedAnswer(
      prisma,
      userId,
      'speciesPhoto',
      ai.checkSpeciesPhoto({ photo, scientificName }),
    );
    await recordAiUsage(prisma, userId, 'speciesPhoto', usage);
    if (!result.suitable) {
      log(`Rejected a Commons photo of ${scientificName}: ${result.reason}`);
    }
    return result.suitable;
  };
}
