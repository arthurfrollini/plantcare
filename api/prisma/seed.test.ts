import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { resetDb } from '../test/helpers';
import { seed } from './seed';
import { plantSeeds } from './seed-data';

describe('seed', () => {
  beforeAll(async () => {
    await resetDb(prisma);
    await seed(prisma);
    await seed(prisma);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('is idempotent: 9 plants, 18 translations, no duplicate aliases', async () => {
    expect(await prisma.plant.count()).toBe(9);
    expect(await prisma.plantTranslation.count()).toBe(18);
    const expected = plantSeeds.reduce((n, p) => n + p.aliases.length, 0);
    expect(await prisma.plantAlias.count()).toBe(expected);
  });

  it('gives every plant both locales and a unique scientific name', async () => {
    const plants = await prisma.plant.findMany({
      include: { translations: true },
    });
    for (const plant of plants) {
      expect(plant.translations.map((t) => t.locale).sort()).toEqual([
        'en',
        'pt-BR',
      ]);
      expect(plant.source).toBe('curated');
    }
    expect(new Set(plants.map((p) => p.scientificName)).size).toBe(9);
  });

  it('stores accent-free search names', async () => {
    const t = await prisma.plantTranslation.findFirstOrThrow({
      where: { name: 'Espada São Jorge' },
    });
    expect(t.searchName).toBe('espada sao jorge');
    const alias = await prisma.plantAlias.findFirstOrThrow({
      where: { name: 'aninga-pará' },
    });
    expect(alias.searchName).toBe('aninga para');
  });

  it('uses the corrected 1/week frequency for zamioculca and espada-sao-jorge', async () => {
    for (const slug of ['zamioculca', 'espada-sao-jorge']) {
      const plant = await prisma.plant.findUniqueOrThrow({
        where: { slug },
        include: { translations: true },
      });
      expect([plant.frequencyTimes, plant.frequencyPer]).toEqual([1, 'week']);
    }
  });

  it('keeps the watering frequency out of every water tip', async () => {
    const translations = await prisma.plantTranslation.findMany();
    expect(translations).toHaveLength(18);
    for (const t of translations) {
      expect(t.waterTips).not.toMatch(
        /\d|\b(times?|once|twice|vez(es)?|week|day|semana|dia)\b/i,
      );
    }
  });

  it('overwrites edited translation rows on re-run', async () => {
    await prisma.plantTranslation.updateMany({ data: { waterTips: 'stale' } });
    await seed(prisma);
    const stale = await prisma.plantTranslation.count({
      where: { waterTips: 'stale' },
    });
    expect(stale).toBe(0);
  });

  it('references image files that exist in public/plants', async () => {
    const plants = await prisma.plant.findMany();
    for (const plant of plants) {
      expect(plant.imageFile).toBeTruthy();
      expect(
        existsSync(
          new URL(`../public/plants/${plant.imageFile}`, import.meta.url),
        ),
      ).toBe(true);
    }
  });

  it('credits every catalog photo; only aningapara keeps its illustration', async () => {
    const plants = await prisma.plant.findMany({ orderBy: { slug: 'asc' } });
    for (const plant of plants) {
      if (plant.slug === 'aningapara') {
        expect(plant.imageFile).toBe('aningapara.svg');
        expect(plant.imageAuthor).toBeNull();
        continue;
      }
      expect(plant.imageFile).toBe(`${plant.slug}.webp`);
      expect(plant.imageAuthor).toBeTruthy();
      expect(plant.imageLicense).toMatch(/^(CC0|Public domain)/);
      expect(plant.imageSource).toMatch(
        /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/,
      );
    }
  });

  it('keeps every illustration, for apps that cached the old image URLs', () => {
    for (const plant of plantSeeds) {
      expect(
        existsSync(
          new URL(`../public/plants/${plant.slug}.svg`, import.meta.url),
        ),
      ).toBe(true);
    }
  });
});
