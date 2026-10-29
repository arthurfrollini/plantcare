import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { CheckSpeciesPhoto } from './commons';
import { findReferencePhoto } from './reference-photo';

const here = path.dirname(new URL(import.meta.url).pathname);
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(here, 'fixtures', name), 'utf8'));
const commonsSearch = fixture('commons-zamioculcas.json');
const taxa = fixture('inaturalist-taxa.json');
const taxon = fixture('inaturalist-taxon.json');

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

function urlOf(target: Parameters<typeof fetch>[0]): string {
  if (typeof target === 'string') return target;
  return target instanceof URL ? target.href : '';
}

let photo: Buffer;
let small: Buffer;
beforeAll(async () => {
  const make = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: '#3a7' } })
      .jpeg()
      .toBuffer();
  photo = await make(1200, 1600);
  small = await make(1000, 600);
});

type Answer = 'fixture' | 'empty' | 'down';

/** Commons and iNaturalist answering as asked, with a photo for every download. */
function sources(
  commons: Answer,
  inat: Answer,
  download: () => Response = () =>
    new Response(new Uint8Array(photo), { status: 200 }),
) {
  return vi.fn<typeof fetch>((input) => {
    const url = urlOf(input);
    const answer = (kind: Answer, body: unknown, empty: unknown) =>
      Promise.resolve(
        kind === 'down'
          ? new Response('', { status: 503 })
          : json(kind === 'fixture' ? body : empty),
      );
    if (url.startsWith('https://commons.wikimedia.org/'))
      return answer(commons, commonsSearch, { batchcomplete: '' });
    if (url.startsWith('https://api.inaturalist.org/v1/taxa?'))
      return answer(inat, taxa, { total_results: 0, results: [] });
    if (url.startsWith('https://api.inaturalist.org/v1/taxa/'))
      return answer(inat, taxon, { results: [] });
    return Promise.resolve(download());
  });
}

const find = (
  fetchImpl: typeof fetch,
  check: CheckSpeciesPhoto,
  deadlineMs?: number,
) =>
  findReferencePhoto({
    scientificName: 'Zantedeschia aethiopica',
    check,
    fetchImpl,
    ...(deadlineMs === undefined ? {} : { deadlineMs }),
  });

describe('findReferencePhoto', () => {
  it('tries Commons first, then iNaturalist, and keeps the first approved photo as an 800 px WebP', async () => {
    const check = vi
      .fn<CheckSpeciesPhoto>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await find(sources('fixture', 'fixture'), check);

    expect(check).toHaveBeenCalledTimes(3);
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.photo).toMatchObject({
      license: 'CC BY-SA',
      source: 'https://www.inaturalist.org/photos/63504546',
    });
    const meta = await sharp(result.webp).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 800, 800]);
  });

  it('is notFound after at most 4 rejected checks', async () => {
    const check = vi.fn<CheckSpeciesPhoto>(() => Promise.resolve(false));
    expect(await find(sources('fixture', 'fixture'), check)).toEqual({
      status: 'notFound',
    });
    expect(check).toHaveBeenCalledTimes(4);
  });

  it('counts a check that fails as a no', async () => {
    const check = vi
      .fn<CheckSpeciesPhoto>()
      .mockRejectedValueOnce(new Error('AI down'))
      .mockResolvedValueOnce(true);
    const result = await find(sources('fixture', 'empty'), check);
    expect(result.status).toBe('found');
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('is unavailable when the sources are down and nothing was checked', async () => {
    const check = vi.fn<CheckSpeciesPhoto>(() => Promise.resolve(true));
    expect(await find(sources('down', 'down'), check)).toEqual({
      status: 'unavailable',
    });
    expect(await find(sources('empty', 'down'), check)).toEqual({
      status: 'unavailable',
    });
    expect(check).not.toHaveBeenCalled();
  });

  it('is unavailable when every download fails', async () => {
    const check = vi.fn<CheckSpeciesPhoto>(() => Promise.resolve(true));
    expect(
      await find(
        sources('fixture', 'fixture', () => new Response('', { status: 503 })),
        check,
      ),
    ).toEqual({ status: 'unavailable' });
  });

  it('is notFound when both sources answer with nothing', async () => {
    const check = vi.fn<CheckSpeciesPhoto>(() => Promise.resolve(true));
    expect(await find(sources('empty', 'empty'), check)).toEqual({
      status: 'notFound',
    });
  });

  it('skips a download under 700 px without checking it', async () => {
    const check = vi.fn<CheckSpeciesPhoto>(() => Promise.resolve(true));
    const result = await find(
      sources(
        'fixture',
        'empty',
        () => new Response(new Uint8Array(small), { status: 200 }),
      ),
      check,
    );
    expect(check).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'notFound' });
  });

  it('stops at the deadline', async () => {
    const hanging = vi.fn<CheckSpeciesPhoto>(() => new Promise(() => {}));
    const started = Date.now();
    expect(await find(sources('fixture', 'fixture'), hanging, 100)).toEqual({
      status: 'notFound',
    });
    expect(Date.now() - started).toBeLessThan(1000);

    const silent = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    expect(await find(silent, hanging, 100)).toEqual({ status: 'unavailable' });
  });
});
