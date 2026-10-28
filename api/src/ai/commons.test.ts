import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db';
import { createDiskStorage } from '../storage';
import { resetDb } from '../../test/helpers';
import { attachSpeciesPhoto, findPublicDomainPhoto } from './commons';

const here = path.dirname(new URL(import.meta.url).pathname);
const search: unknown = JSON.parse(
  readFileSync(path.join(here, 'fixtures/commons-zamioculcas.json'), 'utf8'),
);
const busy: unknown = JSON.parse(
  readFileSync(path.join(here, 'fixtures/commons-busy.json'), 'utf8'),
);

type Page = {
  imageinfo: { extmetadata: { LicenseShortName: { value: string } } }[];
};
type Search = { query: { pages: Record<string, Page> } };

function isSearch(value: unknown): value is Search {
  return typeof value === 'object' && value !== null && 'query' in value;
}

/** The fixture with only its CC BY / CC BY-SA photos left. */
function onlyAttributionRequired(): unknown {
  if (!isSearch(search)) throw new Error('bad fixture');
  const pages = Object.fromEntries(
    Object.entries(search.query.pages).filter(([, page]) =>
      page.imageinfo[0]?.extmetadata.LicenseShortName.value.startsWith('CC BY'),
    ),
  );
  return { ...search, query: { pages } };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

describe('findPublicDomainPhoto', () => {
  it('takes the first public-domain or CC0 photo whose short side is at least 800 px', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(json(search)));
    const photo = await findPublicDomainPhoto(
      'Zamioculcas zamiifolia',
      fetchImpl,
    );
    expect(photo).toMatchObject({
      license: 'Public domain',
      source:
        'https://commons.wikimedia.org/wiki/File:Zamioculcas_zamiifolia_DPR.png',
    });
    const target = fetchImpl.mock.calls[0]?.[0];
    const url =
      typeof target === 'string'
        ? target
        : target instanceof URL
          ? target.href
          : '';
    expect(url).toContain('Zamioculcas+zamiifolia');
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('user-agent')).toContain('PlantCare');
  });

  it('skips photos that need attribution, and returns null when nothing else is left', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(json(onlyAttributionRequired())),
    );
    expect(
      await findPublicDomainPhoto('Zamioculcas zamiifolia', fetchImpl),
    ).toBeNull();
  });

  it('returns null when Commons answers with an error', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(json(busy)));
    expect(
      await findPublicDomainPhoto('Zamioculcas zamiifolia', fetchImpl),
    ).toBeNull();
  });
});

describe('attachSpeciesPhoto', () => {
  let dir: string;
  let plantId: string;

  beforeEach(async () => {
    await resetDb(prisma);
    dir = await mkdtemp(path.join(os.tmpdir(), 'plantcare-commons-'));
    plantId = (
      await prisma.plant.create({
        data: {
          slug: 'zz',
          scientificName: 'Zamioculcas zamiifolia',
          source: 'ai',
          light: 'partial_shade',
          difficulty: 'easy',
          frequencyTimes: 1,
          frequencyPer: 'twoWeeks',
        },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it('saves an 800x800 WebP and the credit', async () => {
    const photo = await sharp({
      create: { width: 1200, height: 1600, channels: 3, background: '#3a7' },
    })
      .jpeg()
      .toBuffer();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(search))
      .mockResolvedValueOnce(new Response(photo, { status: 200 }));

    await attachSpeciesPhoto(
      prisma,
      createDiskStorage(dir),
      plantId,
      'Zamioculcas zamiifolia',
      fetchImpl,
    );

    const plant = await prisma.plant.findUniqueOrThrow({
      where: { id: plantId },
    });
    expect(plant).toMatchObject({
      imageKey: `species/${plantId}.webp`,
      imageLicense: 'Public domain',
      imageSource:
        'https://commons.wikimedia.org/wiki/File:Zamioculcas_zamiifolia_DPR.png',
    });
    expect(plant.imageAuthor).not.toContain('<');
    const saved = await createDiskStorage(dir).read(`species/${plantId}.webp`);
    expect(saved).not.toBeNull();
    const meta = await sharp(saved ?? Buffer.alloc(0)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 800, 800]);
  });

  it('leaves the species alone when the download fails or times out', async () => {
    for (const fetchImpl of [
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json(search))
        .mockResolvedValueOnce(new Response('', { status: 500 })),
      vi.fn<typeof fetch>(() =>
        Promise.reject(new DOMException('timed out', 'TimeoutError')),
      ),
    ]) {
      await expect(
        attachSpeciesPhoto(
          prisma,
          createDiskStorage(dir),
          plantId,
          'Zamioculcas zamiifolia',
          fetchImpl,
        ),
      ).resolves.toBeUndefined();
      const plant = await prisma.plant.findUniqueOrThrow({
        where: { id: plantId },
      });
      expect(plant.imageKey).toBeNull();
    }
  });
});
