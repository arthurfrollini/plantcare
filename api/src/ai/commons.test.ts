import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db';
import { createDiskStorage } from '../storage';
import { resetDb } from '../../test/helpers';
import {
  attachSpeciesPhoto,
  findPublicDomainPhotoByTitle,
  findPublicDomainPhotos,
  type CheckSpeciesPhoto,
} from './commons';

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

/** The URL of the stub's first request. */
function firstUrl(fetchImpl: { mock: { calls: Parameters<typeof fetch>[] } }) {
  const target = fetchImpl.mock.calls[0]?.[0];
  if (typeof target === 'string') return target;
  return target instanceof URL ? target.href : '';
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

describe('findPublicDomainPhotos', () => {
  it('lists up to 3 public-domain or CC0 photos whose short side is at least 800 px, in search order', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(json(search)));
    const photos = await findPublicDomainPhotos(
      'Zamioculcas zamiifolia',
      fetchImpl,
    );
    expect(photos.map((photo) => photo.license)).toEqual([
      'Public domain',
      'CC0',
      'CC0',
    ]);
    expect(photos[0]?.source).toBe(
      'https://commons.wikimedia.org/wiki/File:Zamioculcas_zamiifolia_DPR.png',
    );
    const url = firstUrl(fetchImpl);
    // Only files filed under the species' own category: a free-text search once
    // returned a coin with "Zantedeschia aethiopica" in its description.
    expect(new URL(url).searchParams.get('gsrsearch')).toBe(
      'incategory:"Zamioculcas zamiifolia" filetype:bitmap',
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('user-agent')).toContain('PlantCare');
  });

  it('skips photos that need attribution, and is empty when nothing else is left', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(json(onlyAttributionRequired())),
    );
    expect(
      await findPublicDomainPhotos('Zamioculcas zamiifolia', fetchImpl),
    ).toEqual([]);
  });

  it('is empty when Commons answers with an error', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(json(busy)));
    expect(
      await findPublicDomainPhotos('Zamioculcas zamiifolia', fetchImpl),
    ).toEqual([]);
  });
});

describe('findPublicDomainPhotoByTitle', () => {
  // A titles query answers without the search index.
  const byTitle = (license: string) => ({
    query: {
      pages: {
        '7': {
          imageinfo: [
            {
              width: 1200,
              height: 900,
              url: 'https://upload.wikimedia.org/m.jpg',
              descriptionurl:
                'https://commons.wikimedia.org/wiki/File:Monstera1.JPG',
              extmetadata: {
                LicenseShortName: { value: license },
                Artist: { value: '<a href="#">Jo</a>' },
              },
            },
          ],
        },
      },
    },
  });

  it('returns the named file when it is public domain', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(json(byTitle('Public domain'))),
    );
    expect(
      await findPublicDomainPhotoByTitle('File:Monstera1.JPG', fetchImpl),
    ).toEqual({
      url: 'https://upload.wikimedia.org/m.jpg',
      author: 'Jo',
      license: 'Public domain',
      source: 'https://commons.wikimedia.org/wiki/File:Monstera1.JPG',
    });
    expect(new URL(firstUrl(fetchImpl)).searchParams.get('titles')).toBe(
      'File:Monstera1.JPG',
    );
  });

  it('refuses a file that needs attribution', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(json(byTitle('CC BY-SA 4.0'))),
    );
    expect(
      await findPublicDomainPhotoByTitle('File:Monstera1.JPG', fetchImpl),
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

  /** A photo for every download, so each candidate gets as far as the check. */
  async function commons(downloads: number) {
    const photo = await sharp({
      create: { width: 1200, height: 1600, channels: 3, background: '#3a7' },
    })
      .jpeg()
      .toBuffer();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(search));
    for (let i = 0; i < downloads; i++) {
      fetchImpl.mockResolvedValueOnce(new Response(photo, { status: 200 }));
    }
    return fetchImpl;
  }

  const attach = (fetchImpl: typeof fetch, check: CheckSpeciesPhoto) =>
    attachSpeciesPhoto({
      prisma,
      storage: createDiskStorage(dir),
      plantId,
      scientificName: 'Zamioculcas zamiifolia',
      check,
      fetchImpl,
    });

  const stored = () =>
    prisma.plant.findUniqueOrThrow({ where: { id: plantId } });

  it('saves the first photo the check approves as an 800x800 WebP, with its credit', async () => {
    await attach(await commons(1), () => Promise.resolve(true));

    expect(await stored()).toMatchObject({
      imageKey: `species/${plantId}.webp`,
      imageLicense: 'Public domain',
      imageSource:
        'https://commons.wikimedia.org/wiki/File:Zamioculcas_zamiifolia_DPR.png',
    });
    expect((await stored()).imageAuthor).not.toContain('<');
    const saved = await createDiskStorage(dir).read(`species/${plantId}.webp`);
    expect(saved).not.toBeNull();
    const meta = await sharp(saved ?? Buffer.alloc(0)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 800, 800]);
  });

  it('sends the check a JPEG no larger than 512 px', async () => {
    const check = vi.fn<CheckSpeciesPhoto>(() => Promise.resolve(true));
    await attach(await commons(1), check);

    const sent = check.mock.calls[0]?.[0] ?? Buffer.alloc(0);
    const meta = await sharp(sent).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(512);
  });

  it('skips a photo the check rejects and keeps the next one', async () => {
    const check = vi
      .fn<CheckSpeciesPhoto>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await attach(await commons(2), check);

    expect(check).toHaveBeenCalledTimes(2);
    expect((await stored()).imageSource).toBe(
      'https://commons.wikimedia.org/wiki/File:%22Zamio_Mater%22_Zamioculcas_zamiifolia_communis_plant.jpg',
    );
  });

  it('counts a check that fails as a rejection', async () => {
    const check = vi
      .fn<CheckSpeciesPhoto>()
      .mockRejectedValueOnce(new Error('AI down'))
      .mockResolvedValueOnce(true);
    await attach(await commons(2), check);

    expect((await stored()).imageSource).toContain('communis_plant');
  });

  it('keeps no photo when the check rejects all 3 candidates', async () => {
    const check = vi.fn<CheckSpeciesPhoto>(() => Promise.resolve(false));
    await attach(await commons(3), check);

    expect(check).toHaveBeenCalledTimes(3);
    expect((await stored()).imageKey).toBeNull();
  });

  it('leaves the species alone when the download fails or times out', async () => {
    for (const fetchImpl of [
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json(search))
        .mockResolvedValue(new Response('', { status: 500 })),
      vi.fn<typeof fetch>(() =>
        Promise.reject(new DOMException('timed out', 'TimeoutError')),
      ),
    ]) {
      const check = vi.fn<CheckSpeciesPhoto>(() => Promise.resolve(true));
      await expect(attach(fetchImpl, check)).resolves.toBeUndefined();
      expect(check).not.toHaveBeenCalled();
      expect((await stored()).imageKey).toBeNull();
    }
  });
});
