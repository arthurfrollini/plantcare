import { z } from 'zod';
import {
  CANDIDATES_PER_SOURCE,
  MIN_SHORT_SIDE,
  TIMEOUT_MS,
  USER_AGENT,
  type SourcePhoto,
} from './commons';

const API = 'https://api.inaturalist.org/v1';

/** The free licences iNaturalist offers, as the credit names them. */
const LICENSES: Record<string, string> = {
  cc0: 'CC0',
  'cc-by': 'CC BY',
  'cc-by-sa': 'CC BY-SA',
};

const taxaSchema = z.object({
  results: z.array(
    z.object({ id: z.number(), name: z.string(), rank: z.string() }),
  ),
});

const taxonSchema = z.object({
  results: z
    .array(
      z.object({
        taxon_photos: z.array(
          z.object({
            photo: z.object({
              id: z.number(),
              license_code: z.string().nullable(),
              attribution: z.string(),
              url: z.string(),
              original_dimensions: z
                .object({ width: z.number(), height: z.number() })
                .nullable()
                .optional(),
            }),
          }),
        ),
      }),
    )
    .min(1),
});

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`iNaturalist answered ${response.status}`);
  return response.json();
}

/**
 * The photographer, from an attribution such as "(c) Jane Doe, some rights reserved (CC BY)" or
 * "no rights reserved, uploaded by Jane Doe".
 */
function authorOf(attribution: string): string {
  const text = attribution.replace(/\s+/g, ' ').trim();
  const owner = /^\(c\)\s*(.+?),\s*(?:some|all|no) rights reserved/i.exec(
    text,
  )?.[1];
  const uploader = /uploaded by (.+)$/i.exec(text)?.[1];
  return (
    (owner ?? uploader ?? '').replace(/^photo by /i, '').trim() || 'Unknown'
  );
}

/**
 * Up to 2 freely licensed photos iNaturalist shows for the species with exactly this name, whose
 * short side is at least 700 px. Empty when there is none; null when iNaturalist can't answer.
 */
export async function findINaturalistPhotos(
  scientificName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SourcePhoto[] | null> {
  try {
    const params = new URLSearchParams({
      q: scientificName,
      rank: 'species',
      per_page: '5',
    });
    const taxa = taxaSchema.parse(
      await getJson(`${API}/taxa?${params.toString()}`, fetchImpl),
    );
    const wanted = scientificName.trim().toLowerCase();
    const match = taxa.results.find(
      (taxon) =>
        taxon.rank === 'species' && taxon.name.toLowerCase() === wanted,
    );
    if (!match) return [];

    const taxon = taxonSchema.parse(
      await getJson(`${API}/taxa/${match.id}`, fetchImpl),
    );
    const photos: SourcePhoto[] = [];
    for (const { photo } of taxon.results[0]?.taxon_photos ?? []) {
      const license = LICENSES[photo.license_code ?? ''];
      if (!license) continue;
      const size = photo.original_dimensions;
      if (size && Math.min(size.width, size.height) < MIN_SHORT_SIDE) continue;
      photos.push({
        url: photo.url.replace('/square.', '/original.'),
        author: authorOf(photo.attribution),
        license,
        source: `https://www.inaturalist.org/photos/${photo.id}`,
      });
      if (photos.length === CANDIDATES_PER_SOURCE) break;
    }
    return photos;
  } catch {
    return null;
  }
}
