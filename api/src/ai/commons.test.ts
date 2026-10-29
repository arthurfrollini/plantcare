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
  storeSpeciesPhoto,
  findCommonsPhotoByTitle,
  findCommonsPhotos,
  isFreeLicense,
  type CheckSpeciesPhoto,
} from './commons';
import { attachSpeciesPhoto } from './reference-photo';

const here = path.dirname(new URL(import.meta.url).pathname);
const search: unknown = JSON.parse(
  readFileSync(path.join(here, 'fixtures/commons-zamioculcas.json'), 'utf8'),
);
const busy: unknown = JSON.parse(
  readFileSync(path.join(here, 'fixtures/commons-busy.json'), 'utf8'),
);

/** The URL a fetch call asked for. */
function urlOf(target: Parameters<typeof fetch>[0] | undefined): string {
  if (typeof target === 'string') return target;
  return target instanceof URL ? target.href : '';
}

/** The URL of the stub's first request. */
function firstUrl(fetchImpl: { mock: { calls: Parameters<typeof fetch>[] } }) {
  return urlOf(fetchImpl.mock.calls[0]?.[0]);
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

describe('isFreeLicense', () => {
  it.each([
    ['CC0', true],
    ['CC0 1.0', true],
    ['Public domain', true],
    ['PD-self', true],
    ['CC BY 2.0', true],
    ['CC BY-SA 4.0', true],
    ['CC-BY-SA-3.0', true],
    ['CC BY-SA 3.0 de', true],
    ['CC BY-NC-SA 4.0', false],
    ['CC BY-ND 4.0', false],
    ['GFDL', false],
    ['Attribution', false],
    ['', false],
  ])('%s → %s', (license, free) => {
    expect(isFreeLicense(license)).toBe(free);
  });
});

describe('findCommonsPhotos', () => {
  it('lists up to 2 freely licensed photos whose short side is at least 700 px, in search order', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(json(search)));
    const photos = await findCommonsPhotos('Zamioculcas zamiifolia', fetchImpl);
    expect(photos?.map((photo) => [photo.license, photo.source])).toEqual([
      [
        'CC BY-SA 3.0',
        'https://commons.wikimedia.org/wiki/File:Zamioculcas_zamiifolia_1.jpg',
      ],
      [
        'CC BY-SA 4.0',
        'https://commons.wikimedia.org/wiki/File:Zamioculcas_zamiifolia_in_China_(4).jpg',
      ],
    ]);
    const url = firstUrl(fetchImpl);
    // Only files filed under the species' own category: a free-text search once
    // returned a coin with "Zantedeschia aethiopica" in its description.
    expect(new URL(url).searchParams.get('gsrsearch')).toBe(
      'incategory:"Zamioculcas zamiifolia" filetype:bitmap',
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('user-agent')).toContain('PlantCare');
  });

  it('keeps a 750 px short side and drops a smaller one', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        json({
          query: {
            pages: {
              '1': titlePage('CC0', 1000, 750, 1),
              '2': titlePage('CC0', 1000, 690, 2),
            },
          },
        }),
      ),
    );
    const photos = await findCommonsPhotos('Monstera deliciosa', fetchImpl);
    expect(photos).toHaveLength(1);
  });

  it('is empty when Commons answers without a match', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(json({ batchcomplete: '' })),
    );
    expect(
      await findCommonsPhotos('Zamioculcas zamiifolia', fetchImpl),
    ).toEqual([]);
  });

  it('is null when Commons fails: an error answer, a 500 or no answer at all', async () => {
    for (const fetchImpl of [
      vi.fn<typeof fetch>(() => Promise.resolve(json(busy))),
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response('', { status: 500 })),
      ),
      vi.fn<typeof fetch>(() =>
        Promise.reject(new DOMException('timed out', 'TimeoutError')),
      ),
    ]) {
      expect(
        await findCommonsPhotos('Zamioculcas zamiifolia', fetchImpl),
      ).toBeNull();
    }
  });
});

/** One Commons file as a titles or search query returns it. */
function titlePage(
  license: string,
  width = 1200,
  height = 900,
  index?: number,
) {
  return {
    ...(index === undefined ? {} : { index }),
    imageinfo: [
      {
        width,
        height,
        url: 'https://upload.wikimedia.org/m.jpg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Monstera1.JPG',
        extmetadata: {
          LicenseShortName: { value: license },
          Artist: { value: '<a href="#">Jo</a>' },
        },
      },
    ],
  };
}

describe('findCommonsPhotoByTitle', () => {
  // A titles query answers without the search index.
  const byTitle = (license: string) => ({
    query: { pages: { '7': titlePage(license) } },
  });

  it('returns the named file when its licence is free', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(json(byTitle('CC BY-SA 4.0'))),
    );
    expect(
      await findCommonsPhotoByTitle('File:Monstera1.JPG', fetchImpl),
    ).toEqual({
      url: 'https://upload.wikimedia.org/m.jpg',
      author: 'Jo',
      license: 'CC BY-SA 4.0',
      source: 'https://commons.wikimedia.org/wiki/File:Monstera1.JPG',
    });
    expect(new URL(firstUrl(fetchImpl)).searchParams.get('titles')).toBe(
      'File:Monstera1.JPG',
    );
  });

  it('refuses a file under a non-commercial licence', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(json(byTitle('CC BY-NC-SA 4.0'))),
    );
    expect(
      await findCommonsPhotoByTitle('File:Monstera1.JPG', fetchImpl),
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

  /** Commons with the fixture search, iNaturalist with nothing, and a photo for every download. */
  async function commons() {
    const photo = await sharp({
      create: { width: 1200, height: 1600, channels: 3, background: '#3a7' },
    })
      .jpeg()
      .toBuffer();
    return vi.fn<typeof fetch>((input) => {
      const url = urlOf(input);
      if (url.startsWith('https://commons.wikimedia.org/'))
        return Promise.resolve(json(search));
      if (url.startsWith('https://api.inaturalist.org/'))
        return Promise.resolve(json({ total_results: 0, results: [] }));
      return Promise.resolve(new Response(photo, { status: 200 }));
    });
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
    await attach(await commons(), () => Promise.resolve(true));

    expect(await stored()).toMatchObject({
      imageKey: `species/${plantId}.webp`,
      imageLicense: 'CC BY-SA 3.0',
      imageSource:
        'https://commons.wikimedia.org/wiki/File:Zamioculcas_zamiifolia_1.jpg',
    });
    expect((await stored()).imageAuthor).not.toContain('<');
    const saved = await createDiskStorage(dir).read(`species/${plantId}.webp`);
    expect(saved).not.toBeNull();
    const meta = await sharp(saved ?? Buffer.alloc(0)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 800, 800]);
  });

  it('sends the check a JPEG no larger than 512 px', async () => {
    const check = vi.fn<CheckSpeciesPhoto>(() => Promise.resolve(true));
    await attach(await commons(), check);

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
    await attach(await commons(), check);

    expect(check).toHaveBeenCalledTimes(2);
    expect((await stored()).imageSource).toBe(
      'https://commons.wikimedia.org/wiki/File:Zamioculcas_zamiifolia_in_China_(4).jpg',
    );
  });

  it('counts a check that fails as a rejection', async () => {
    const check = vi
      .fn<CheckSpeciesPhoto>()
      .mockRejectedValueOnce(new Error('AI down'))
      .mockResolvedValueOnce(true);
    await attach(await commons(), check);

    expect((await stored()).imageSource).toContain('in_China');
  });

  it('keeps no photo when the check rejects every candidate', async () => {
    const check = vi.fn<CheckSpeciesPhoto>(() => Promise.resolve(false));
    await attach(await commons(), check);

    expect(check).toHaveBeenCalledTimes(2);
    expect((await stored()).imageKey).toBeNull();
  });

  it('never replaces a photo the species already has, unless asked to', async () => {
    const storage = createDiskStorage(dir);
    await prisma.plant.update({
      where: { id: plantId },
      data: {
        imageKey: `species/${plantId}.webp`,
        imageAuthor: 'First',
        imageLicense: 'CC0',
        imageSource: 'https://first',
      },
    });
    await storage.save(`species/${plantId}.webp`, Buffer.from('first'));
    const late = {
      url: '',
      author: 'Late',
      license: 'CC BY',
      source: 'https://late',
    };

    expect(
      await storeSpeciesPhoto(
        prisma,
        storage,
        plantId,
        late,
        Buffer.from('late'),
      ),
    ).toBe(false);
    expect((await stored()).imageAuthor).toBe('First');
    expect(await storage.read(`species/${plantId}.webp`)).toEqual(
      Buffer.from('first'),
    );

    expect(
      await storeSpeciesPhoto(
        prisma,
        storage,
        plantId,
        late,
        Buffer.from('late'),
        {
          replace: true,
        },
      ),
    ).toBe(true);
    expect((await stored()).imageAuthor).toBe('Late');
    expect(await storage.read(`species/${plantId}.webp`)).toEqual(
      Buffer.from('late'),
    );
  });

  it('leaves the species alone when the download fails or times out', async () => {
    for (const fetchImpl of [
      vi.fn<typeof fetch>((input) =>
        Promise.resolve(
          urlOf(input).startsWith('https://commons.wikimedia.org/')
            ? json(search)
            : new Response('', { status: 500 }),
        ),
      ),
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
