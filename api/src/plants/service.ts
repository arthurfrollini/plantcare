import {
  difficultySchema,
  frequencySchema,
  lightSchema,
  plantSourceSchema,
  type CatalogPage,
  type CatalogPlant,
  type Difficulty,
  type ImageCredit,
  type Light,
  type Locale,
} from '@plantcare/shared';
import type { PrismaClient } from '../generated/prisma/client';
import { toSearchName } from './search-name';

export const PAGE_SIZE = 20;

export type CatalogQuery = {
  search?: string | undefined;
  light?: Light | undefined;
  difficulty?: Difficulty | undefined;
  page: number;
};

const include = { translations: true } as const;

type PlantRow = Awaited<ReturnType<typeof findRows>>[number];

function findRows(prisma: PrismaClient, where: object) {
  return prisma.plant.findMany({ where, include });
}

/** The translation in the locale, else the English one, else null. */
export function pickTranslation<T extends { locale: string }>(
  translations: T[],
  locale: Locale,
): T | null {
  return (
    translations.find((t) => t.locale === locale) ??
    translations.find((t) => t.locale === 'en') ??
    null
  );
}

function toCatalogPlant(row: PlantRow, locale: Locale): CatalogPlant | null {
  const text = pickTranslation(row.translations, locale);
  if (!text) return null;
  return {
    id: row.id,
    slug: row.slug,
    scientificName: row.scientificName,
    source: plantSourceSchema.parse(row.source),
    name: text.name,
    about: text.about,
    waterTips: text.waterTips,
    light: lightSchema.parse(row.light),
    difficulty: difficultySchema.parse(row.difficulty),
    frequency: frequencySchema.parse({
      times: row.frequencyTimes,
      per: row.frequencyPer,
    }),
    imageUrl: speciesImageUrl(row),
    imageCredit: speciesImageCredit(row),
  };
}

/** A stored species photo wins over the bundled illustration. */
export function speciesImageUrl(row: {
  id: string;
  imageKey: string | null;
  imageFile: string | null;
}): string | null {
  if (row.imageKey) return `/plants/${row.id}/image`;
  return row.imageFile ? `/static/plants/${row.imageFile}` : null;
}

/** Escapes LIKE wildcards so user input matches literally. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

export async function listCatalog(
  prisma: PrismaClient,
  locale: Locale,
  query: CatalogQuery,
): Promise<CatalogPage> {
  const term = query.search ? escapeLike(toSearchName(query.search)) : '';
  const rows = await findRows(prisma, {
    ...(query.light ? { light: query.light } : {}),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(term
      ? {
          OR: [
            {
              translations: {
                some: { locale, searchName: { contains: term } },
              },
            },
            { aliases: { some: { searchName: { contains: term } } } },
            // Scientific names are plain ASCII, so a case-insensitive match
            // equals matching the normalized name.
            { scientificName: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {}),
  });

  const plants = rows
    .map((row) => toCatalogPlant(row, locale))
    .filter((plant): plant is CatalogPlant => plant !== null)
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, locale) || a.id.localeCompare(b.id),
    );

  const start = (query.page - 1) * PAGE_SIZE;
  return {
    items: plants.slice(start, start + PAGE_SIZE),
    nextPage: start + PAGE_SIZE < plants.length ? query.page + 1 : null,
  };
}

export async function getCatalogPlant(
  prisma: PrismaClient,
  locale: Locale,
  id: string,
): Promise<CatalogPlant | null> {
  const row = await prisma.plant.findUnique({ where: { id }, include });
  return row ? toCatalogPlant(row, locale) : null;
}

/** The stored photo's credit, or null when the species has no photo from Commons. */
export function speciesImageCredit(row: {
  imageAuthor: string | null;
  imageLicense: string | null;
  imageSource: string | null;
}): ImageCredit | null {
  return row.imageAuthor && row.imageLicense && row.imageSource
    ? {
        author: row.imageAuthor,
        license: row.imageLicense,
        source: row.imageSource,
      }
    : null;
}
