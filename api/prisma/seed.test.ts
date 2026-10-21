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
      for (const t of plant.translations) {
        expect(t.waterTips).not.toMatch(/dia|day\b/i);
      }
    }
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
});
