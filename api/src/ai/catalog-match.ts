import type { Identification } from '@plantcare/shared';
import type { PrismaClient } from '../generated/prisma/client';
import { toSearchName } from '../plants/search-name';

/** The catalog species a typed name points to: a translated name, an alias or the scientific name. */
export async function findCatalogMatch(
  prisma: PrismaClient,
  text: string,
): Promise<string | null> {
  const searchName = toSearchName(text);
  if (!searchName) return null;
  const plant = await prisma.plant.findFirst({
    where: {
      OR: [
        { translations: { some: { searchName } } },
        { aliases: { some: { searchName } } },
        { scientificName: { equals: text.trim(), mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  return plant?.id ?? null;
}

/** The catalog species with this scientific name, ignoring case and spacing. */
export async function findSpecies(
  prisma: PrismaClient,
  scientificName: string,
): Promise<string | null> {
  const plant = await prisma.plant.findFirst({
    where: {
      scientificName: {
        equals: scientificName.trim().replace(/\s+/g, ' '),
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });
  return plant?.id ?? null;
}

function slugFor(scientificName: string): string {
  return toSearchName(scientificName)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

/**
 * Saves a confirmed AI identification as a catalog species, or returns the one already there
 * (another user may have confirmed the same species a moment earlier).
 */
export async function createAiSpecies(
  prisma: PrismaClient,
  identification: Identification,
): Promise<string> {
  const existing = await findSpecies(prisma, identification.scientificName);
  if (existing) return existing;
  const scientificName = identification.scientificName
    .trim()
    .replace(/\s+/g, ' ');
  const base = slugFor(scientificName) || 'plant';
  const taken = await prisma.plant.count({
    where: { slug: { startsWith: base } },
  });
  const names = [identification.names.en, identification.names['pt-BR']];
  try {
    const plant = await prisma.plant.create({
      data: {
        slug: taken === 0 ? base : `${base}-${taken + 1}`,
        scientificName,
        source: 'ai',
        light: identification.light,
        difficulty: identification.difficulty,
        frequencyTimes: identification.frequency.times,
        frequencyPer: identification.frequency.per,
        translations: {
          create: (['en', 'pt-BR'] as const).map((locale) => ({
            locale,
            name: identification.names[locale],
            searchName: toSearchName(identification.names[locale]),
            about: identification.about[locale],
            waterTips: identification.waterTips[locale],
          })),
        },
        aliases: {
          create: [...new Set(names)].map((name) => ({
            name,
            searchName: toSearchName(name),
          })),
        },
      },
      select: { id: true },
    });
    return plant.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await findSpecies(prisma, scientificName);
    if (!raced) throw error;
    return raced;
  }
}
