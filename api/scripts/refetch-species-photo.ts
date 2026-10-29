/**
 * Gives a catalog species a new Commons photo, e.g. after the automatic pick was poor.
 *
 *   npx tsx scripts/refetch-species-photo.ts "<scientific name>"                  # as on an add: AI-checked
 *   npx tsx scripts/refetch-species-photo.ts "<scientific name>" "File:<title>"   # a file picked by hand
 *
 * The file must be CC0, public domain, CC BY or CC BY-SA, at least 700 px on its short side. The automatic pick
 * needs ANTHROPIC_API_KEY; its checks are not counted in AiUsage.
 */
import '../src/load-env';
import { createAnthropicPlantAi } from '../src/ai/anthropic-plant-ai';
import {
  downloadPhoto,
  findCommonsPhotoByTitle,
  storeSpeciesPhoto,
  toSpeciesWebp,
} from '../src/ai/commons';
import { attachSpeciesPhoto } from '../src/ai/reference-photo';
import { prisma } from '../src/db';
import { env } from '../src/env';
import { createDiskStorage } from '../src/storage';

async function main(): Promise<void> {
  const [scientificName, title] = process.argv.slice(2);
  if (!scientificName)
    throw new Error(
      'Usage: refetch-species-photo <scientific name> [File:<title>]',
    );
  const plant = await prisma.plant.findUnique({ where: { scientificName } });
  if (!plant) throw new Error(`${scientificName} is not in the catalog`);
  const storage = createDiskStorage(env.UPLOADS_DIR);

  if (title) {
    const photo = await findCommonsPhotoByTitle(title);
    if (!photo)
      throw new Error('Not a freely licensed photo of at least 700 px');
    const original = await downloadPhoto(photo);
    if (!original) throw new Error(`Could not download ${photo.url}`);
    await storeSpeciesPhoto(
      prisma,
      storage,
      plant.id,
      photo,
      await toSpeciesWebp(original),
    );
  } else {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    const ai = createAnthropicPlantAi({
      model: env.AI_MODEL,
      apiKey: env.ANTHROPIC_API_KEY,
    });
    await attachSpeciesPhoto({
      prisma,
      storage,
      plantId: plant.id,
      scientificName,
      check: async (photo) => {
        const { result } = await ai.checkSpeciesPhoto({
          photo,
          scientificName,
        });
        console.log(
          `  check: ${result.suitable ? 'yes' : 'no'}, ${result.reason}`,
        );
        return result.suitable;
      },
      log: (message, error) => console.log(message, error ?? ''),
    });
  }

  const after = await prisma.plant.findUniqueOrThrow({
    where: { id: plant.id },
  });
  console.log(
    `${scientificName}: ${plant.imageSource ?? 'no photo'}\n  -> ${after.imageSource ?? 'no photo'}`,
  );
  await prisma.$disconnect();
}

void main();
