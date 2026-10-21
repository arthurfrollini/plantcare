import { pathToFileURL } from 'node:url';
import { createPrisma } from '../src/db';
import type { PrismaClient } from '../src/generated/prisma/client';
import { toSearchName } from '../src/plants/search-name';
import { plantSeeds, type PlantSeedText } from './seed-data';

const locales = ['en', 'pt-BR'] as const;

export async function seed(prisma: PrismaClient): Promise<void> {
  for (const plant of plantSeeds) {
    const data = {
      scientificName: plant.scientificName,
      source: 'curated' as const,
      light: plant.light,
      difficulty: plant.difficulty,
      frequencyTimes: plant.frequency.times,
      frequencyPer: plant.frequency.per,
      imageFile: plant.imageFile,
    };
    const { id } = await prisma.plant.upsert({
      where: { slug: plant.slug },
      create: { slug: plant.slug, ...data },
      update: data,
    });

    for (const locale of locales) {
      const text: PlantSeedText = plant[locale];
      const fields = {
        name: text.name,
        searchName: toSearchName(text.name),
        about: text.about,
        waterTips: text.waterTips,
      };
      await prisma.plantTranslation.upsert({
        where: { plantId_locale: { plantId: id, locale } },
        create: { plantId: id, locale, ...fields },
        update: fields,
      });
    }

    await prisma.plantAlias.deleteMany({ where: { plantId: id } });
    await prisma.plantAlias.createMany({
      data: plant.aliases.map((name) => ({
        plantId: id,
        name,
        searchName: toSearchName(name),
      })),
    });
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = createPrisma(url);
  try {
    await seed(prisma);
    console.log(`Seeded ${plantSeeds.length} plants`);
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
