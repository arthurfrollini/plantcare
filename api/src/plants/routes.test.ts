import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seed } from '../../prisma/seed';
import { createTestApp, resetDb } from '../../test/helpers';
import { createDiskStorage } from '../storage';

type Item = {
  id: string;
  name: string;
  scientificName: string;
  source: string;
  imageUrl: string | null;
  imageCredit: { author: string; license: string; source: string } | null;
  slug: string;
};
type Page = { items: Item[]; nextPage: number | null };

describe('catalog routes', () => {
  let app: FastifyInstance;
  let close: () => Promise<void>;
  let created: Awaited<ReturnType<typeof createTestApp>>;

  async function list(query: string, language?: string) {
    const res = await app.inject({
      method: 'GET',
      url: `/plants${query}`,
      headers: language ? { 'accept-language': language } : {},
    });
    return res;
  }
  async function names(query: string, language?: string): Promise<string[]> {
    const res = await list(query, language);
    expect(res.statusCode).toBe(200);
    return res.json<Page>().items.map((item) => item.name);
  }

  beforeAll(async () => {
    created = await createTestApp();
    app = created.app;
    close = async () => {
      await app.close();
      await created.prisma.$disconnect();
    };
    await resetDb(created.prisma);
    await seed(created.prisma);
  });
  afterAll(async () => {
    await close();
  });

  it('lists all 9 plants in English sorted by name', async () => {
    const res = await list('');
    expect(res.statusCode).toBe(200);
    const body = res.json<Page>();
    expect(body.items).toHaveLength(9);
    expect(body.nextPage).toBeNull();
    const sorted = body.items
      .map((i) => i.name)
      .sort((a, b) => a.localeCompare(b, 'en'));
    expect(body.items.map((i) => i.name)).toEqual(sorted);
    expect(body.items[0]?.name).toBe('African violet');
    for (const item of body.items) {
      expect(item.scientificName).toBeTruthy();
      expect(item.source).toBe('curated');
    }
  });

  it('returns Portuguese names for pt-BR', async () => {
    const result = await names('', 'pt-BR');
    expect(result).toContain('Orquídea');
    expect(result).toContain('Espada São Jorge');
    expect(result).not.toContain('Moth orchid');
  });

  it('paginates with nextPage', async () => {
    const res = await list('?page=2');
    expect(res.json<Page>()).toEqual({ items: [], nextPage: null });
  });

  it('searches without accents or case', async () => {
    expect(await names('?search=orquidea')).toEqual(['Moth orchid']);
    expect(await names('?search=SAO JORGE', 'pt-BR')).toEqual([
      'Espada São Jorge',
    ]);
  });

  it.each(['_', '%', '\\'])(
    'treats %s in a search as a literal',
    async (term) => {
      expect(await names(`?search=${encodeURIComponent(term)}`)).toEqual([]);
    },
  );

  it('searches aliases and scientific names', async () => {
    expect(await names('?search=lingua de sogra')).toEqual(['Snake plant']);
    expect(await names('?search=sansevieria')).toEqual(['Snake plant']);
    expect(await names('?search=dracaena')).toContain('Snake plant');
  });

  it('filters by light and difficulty', async () => {
    expect(await names('?light=full_sun')).toEqual([
      'Hydrangea',
      'Spineless yucca',
    ]);
    expect(await names('?difficulty=hard')).toEqual(['Moth orchid']);
  });

  it('rejects an invalid light', async () => {
    const res = await list('?light=sunny');
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'validation_error',
    );
  });

  it('rejects page 0', async () => {
    expect((await list('?page=0')).statusCode).toBe(400);
  });

  it('gets one plant in the requested language', async () => {
    const first = (await list('')).json<Page>().items[0];
    const res = await app.inject({
      method: 'GET',
      url: `/plants/${first?.id}`,
      headers: { 'accept-language': 'pt-BR' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<Item>().slug).toBe(first?.slug);
    expect(res.json<Item>().name).not.toBe(first?.name);
  });

  it('falls back to English when the locale translation is missing', async () => {
    const first = (await list('')).json<Page>().items[0];
    const prisma = created.prisma;
    await prisma.plantTranslation.deleteMany({
      where: { plantId: first?.id ?? '', locale: 'pt-BR' },
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/plants/${first?.id}`,
        headers: { 'accept-language': 'pt-BR' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<Item>().name).toBe(first?.name);
    } finally {
      await seed(prisma);
    }
  });

  it('returns 404 for an unknown plant', async () => {
    const res = await app.inject({ method: 'GET', url: '/plants/unknown' });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'plant_not_found',
    );
  });

  it('serves the illustration at imageUrl', async () => {
    const items = (await list('')).json<Page>().items;
    const item = items.find((p) => p.slug === 'aningapara');
    expect(item?.imageUrl).toMatch(/^\/static\/plants\/.+\.svg$/);
    const res = await app.inject({ method: 'GET', url: item?.imageUrl ?? '' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
  });

  it('serves a catalog photo at imageUrl, with its credit', async () => {
    const items = (await list('')).json<Page>().items;
    const item = items.find((p) => p.slug === 'zamioculca');
    expect(item?.imageUrl).toBe('/static/plants/zamioculca.webp');
    expect(item?.imageCredit).toMatchObject({ license: 'CC0' });
    const res = await app.inject({ method: 'GET', url: item?.imageUrl ?? '' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/webp');
  });
});

describe('catalog images', () => {
  let created: Awaited<ReturnType<typeof createTestApp>>;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'plantcare-images-'));
    created = await createTestApp({ photoStorage: createDiskStorage(dir) });
    await resetDb(created.prisma);
    await seed(created.prisma);
  });
  afterAll(async () => {
    await created.app.close();
    await created.prisma.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it('serves a stored species photo and its credit', async () => {
    const plant = await created.prisma.plant.findFirstOrThrow({
      where: { slug: 'yucca' },
    });
    const key = `species/${plant.id}.webp`;
    await createDiskStorage(dir).save(key, Buffer.from('webp-bytes'));
    await created.prisma.plant.update({
      where: { id: plant.id },
      data: {
        imageKey: key,
        imageSource: 'https://commons.wikimedia.org/wiki/File:X.jpg',
        imageAuthor: 'Jane Doe',
        imageLicense: 'CC0',
      },
    });

    const res = await created.app.inject({
      method: 'GET',
      url: `/plants/${plant.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      imageUrl: `/plants/${plant.id}/image`,
      imageCredit: {
        author: 'Jane Doe',
        license: 'CC0',
        source: 'https://commons.wikimedia.org/wiki/File:X.jpg',
      },
    });

    const image = await created.app.inject({
      method: 'GET',
      url: `/plants/${plant.id}/image`,
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.rawPayload).toEqual(Buffer.from('webp-bytes'));
  });

  it('keeps the static image and no credit for a species without a stored photo', async () => {
    const plant = await created.prisma.plant.findFirstOrThrow({
      where: { slug: 'aningapara' },
    });
    const res = await created.app.inject({
      method: 'GET',
      url: `/plants/${plant.id}`,
    });
    expect(res.json()).toMatchObject({
      imageUrl: `/static/plants/${plant.imageFile}`,
      imageCredit: null,
    });
    const image = await created.app.inject({
      method: 'GET',
      url: `/plants/${plant.id}/image`,
    });
    expect(image.statusCode).toBe(404);
  });
});
