import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { findINaturalistPhotos } from './inaturalist';

const here = path.dirname(new URL(import.meta.url).pathname);
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(here, 'fixtures', name), 'utf8'));
const taxa = fixture('inaturalist-taxa.json');
const taxon = fixture('inaturalist-taxon.json');

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

function urlOf(target: Parameters<typeof fetch>[0]): string {
  if (typeof target === 'string') return target;
  return target instanceof URL ? target.href : '';
}

/** iNaturalist answering the taxa search with `search` and the taxon with the fixture. */
function inat(search: unknown = taxa) {
  return vi.fn<typeof fetch>((input) => {
    const url = urlOf(input);
    if (url.startsWith('https://api.inaturalist.org/v1/taxa?'))
      return Promise.resolve(json(search));
    if (url === 'https://api.inaturalist.org/v1/taxa/56006')
      return Promise.resolve(json(taxon));
    return Promise.resolve(new Response('', { status: 404 }));
  });
}

describe('findINaturalistPhotos', () => {
  it('lists up to 2 freely licensed photos of the species, as originals with their credit', async () => {
    const fetchImpl = inat();
    const photos = await findINaturalistPhotos(
      'Zantedeschia aethiopica',
      fetchImpl,
    );

    expect(photos).toEqual([
      {
        url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/63504546/original.jpeg',
        author: 'Dominicus Johannes Bergsma',
        license: 'CC BY-SA',
        source: 'https://www.inaturalist.org/photos/63504546',
      },
      {
        url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/7550838/original.jpg',
        author: 'Peter de Lange',
        license: 'CC0',
        source: 'https://www.inaturalist.org/photos/7550838',
      },
    ]);
    const search = new URL(urlOf(fetchImpl.mock.calls[0]?.[0] ?? ''));
    expect(search.searchParams.get('q')).toBe('Zantedeschia aethiopica');
    expect(search.searchParams.get('rank')).toBe('species');
    for (const [, init] of fetchImpl.mock.calls) {
      expect(new Headers(init?.headers).get('user-agent')).toContain(
        'PlantCare',
      );
    }
  });

  it('matches the scientific name whatever its case', async () => {
    const photos = await findINaturalistPhotos(
      'zantedeschia AETHIOPICA',
      inat(),
    );
    expect(photos).toHaveLength(2);
  });

  it('is empty when no species has exactly that name', async () => {
    for (const results of [
      [],
      [{ id: 56006, name: 'Zantedeschia', rank: 'genus' }],
      [{ id: 56006, name: 'Zantedeschia elliottiana', rank: 'species' }],
    ]) {
      expect(
        await findINaturalistPhotos(
          'Zantedeschia aethiopica',
          inat({ total_results: results.length, results }),
        ),
      ).toEqual([]);
    }
  });

  it('skips non-commercial and unlicensed photos, and photos under 700 px', async () => {
    const photo = (id: number, license_code: string | null, width = 1000) => ({
      photo: {
        id,
        license_code,
        attribution: '(c) Jo, some rights reserved (CC BY)',
        url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/square.jpg`,
        original_dimensions: { width, height: width },
      },
    });
    const fetchImpl = vi.fn<typeof fetch>((input) =>
      Promise.resolve(
        json(
          urlOf(input).includes('/v1/taxa?')
            ? taxa
            : {
                results: [
                  {
                    id: 56006,
                    name: 'Zantedeschia aethiopica',
                    rank: 'species',
                    taxon_photos: [
                      photo(1, 'cc-by-nc'),
                      photo(2, null),
                      photo(3, 'cc-by-nc-sa'),
                      photo(4, 'cc-by', 600),
                      photo(5, 'cc-by'),
                    ],
                  },
                ],
              },
        ),
      ),
    );
    const photos = await findINaturalistPhotos(
      'Zantedeschia aethiopica',
      fetchImpl,
    );
    expect(photos?.map((p) => p.source)).toEqual([
      'https://www.inaturalist.org/photos/5',
    ]);
    expect(photos?.[0]).toMatchObject({ author: 'Jo', license: 'CC BY' });
  });

  it('is null when iNaturalist fails', async () => {
    for (const fetchImpl of [
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response('', { status: 500 })),
      ),
      vi.fn<typeof fetch>(() =>
        Promise.reject(new DOMException('timed out', 'TimeoutError')),
      ),
      vi.fn<typeof fetch>(() => Promise.resolve(json({ nope: true }))),
    ]) {
      expect(
        await findINaturalistPhotos('Zantedeschia aethiopica', fetchImpl),
      ).toBeNull();
    }
  });
});
