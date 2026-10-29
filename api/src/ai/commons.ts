import sharp from 'sharp';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client';
import type { PhotoStorage } from '../storage';

const API = 'https://commons.wikimedia.org/w/api.php';
// Commons asks API clients to say who they are.
export const USER_AGENT = 'PlantCare/0.1 (arthur.frollini@gmail.com)';
export const MIN_SHORT_SIDE = 700;
const SIZE = 800;
export const TIMEOUT_MS = 5000;
/** Candidates each source offers, at most: each check is a paid model call. */
export const CANDIDATES_PER_SOURCE = 2;

/** A photo from Commons or iNaturalist that may illustrate a species, with its credit. */
export type SourcePhoto = {
  /** Where to download the image (a 1600 px thumbnail when Commons offers one). */
  url: string;
  author: string;
  license: string;
  /** The photo's page at its source. */
  source: string;
};

const searchSchema = z.object({
  // Absent when the search matched nothing.
  query: z
    .object({
      pages: z.record(
        z.string(),
        z.object({
          // Absent when the query names titles instead of searching.
          index: z.number().default(0),
          imageinfo: z
            .array(
              z.object({
                width: z.number(),
                height: z.number(),
                url: z.string(),
                thumburl: z.string().optional(),
                descriptionurl: z.string(),
                extmetadata: z
                  .object({
                    LicenseShortName: z
                      .object({ value: z.string() })
                      .optional(),
                    Artist: z.object({ value: z.string() }).optional(),
                  })
                  .optional(),
              }),
            )
            .min(1),
        }),
      ),
    })
    .optional(),
  // Set when Commons refused, e.g. a search too busy to answer.
  error: z.unknown().optional(),
});

/**
 * Whether a licence lets the app show the photo: CC0, public domain, or CC BY / CC BY-SA in any
 * version, which need a credit. Non-commercial, no-derivatives and GFDL-only files are out.
 */
export function isFreeLicense(license: string): boolean {
  const normalized = license.trim().toLowerCase().replace(/-/g, ' ');
  return (
    normalized === 'cc0' ||
    normalized.startsWith('cc0 ') ||
    normalized.startsWith('public domain') ||
    normalized.startsWith('pd') ||
    /^cc by( sa)?( \d+(\.\d+)?)?( [a-z]{2,3})?$/.test(normalized)
  );
}

/** Commons returns the author as HTML (usually a link to the user page). */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The longest side of the copy sent to the check; enough to tell a plant from a coin. */
const CHECK_SIZE = 512;

/** Asks whether a photo can illustrate the species; a rejected promise counts as a no. */
export type CheckSpeciesPhoto = (photo: Buffer) => Promise<boolean>;

/**
 * Up to 2 freely licensed photos in a species' Wikimedia Commons category, in search order, whose
 * short side is at least 700 px. Empty when there is none; null when Commons can't answer.
 */
export async function findCommonsPhotos(
  scientificName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SourcePhoto[] | null> {
  const photos = await freePhotos(
    {
      generator: 'search',
      gsrnamespace: '6',
      // Only files filed under the species: a free-text search matches any file that names it.
      gsrsearch: `incategory:"${scientificName}" filetype:bitmap`,
      gsrlimit: '50',
    },
    fetchImpl,
  );
  return photos?.slice(0, CANDIDATES_PER_SOURCE) ?? null;
}

/** One file picked by hand, e.g. "File:Monstera1.JPG", if its licence is free and it is large enough. */
export async function findCommonsPhotoByTitle(
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SourcePhoto | null> {
  const photos = await freePhotos({ titles: title }, fetchImpl);
  return photos?.[0] ?? null;
}

async function freePhotos(
  query: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<SourcePhoto[] | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    ...query,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|Artist',
    iiurlwidth: '1600',
  });
  let body: unknown;
  try {
    const response = await fetchImpl(`${API}?${params.toString()}`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    body = await response.json();
  } catch {
    return null;
  }
  const parsed = searchSchema.safeParse(body);
  if (!parsed.success || parsed.data.error !== undefined) return null;
  if (!parsed.data.query) return [];

  const pages = Object.values(parsed.data.query.pages).sort(
    (a, b) => a.index - b.index,
  );
  const photos: SourcePhoto[] = [];
  for (const page of pages) {
    const [info] = page.imageinfo;
    const license = info?.extmetadata?.LicenseShortName?.value;
    if (!info || !license || !isFreeLicense(license)) continue;
    if (Math.min(info.width, info.height) < MIN_SHORT_SIDE) continue;
    photos.push({
      url: info.thumburl ?? info.url,
      author: plainText(info.extmetadata?.Artist?.value ?? '') || 'Unknown',
      license,
      source: info.descriptionurl,
    });
  }
  return photos;
}

/** The photo as a JPEG no larger than 512 px, the copy the check looks at. */
export function photoForCheck(original: Buffer): Promise<Buffer> {
  return sharp(original)
    .rotate()
    .resize(CHECK_SIZE, CHECK_SIZE, { fit: 'inside' })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** The full-size photo, or null when the download fails. */
export async function downloadPhoto(
  photo: SourcePhoto,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer | null> {
  try {
    const response = await fetchImpl(photo.url, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/** The photo cropped square to 800 px as WebP, the copy the catalog serves. */
export function toSpeciesWebp(original: Buffer): Promise<Buffer> {
  return sharp(original)
    .rotate()
    .resize(SIZE, SIZE, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer();
}

/**
 * Stores a species photo, already cropped by toSpeciesWebp, with its credit. Only a species with
 * no photo gets one, claimed in the same write that checks, so two adds at once can't mix one's
 * file with the other's credit; `replace` swaps an existing photo on purpose. Says whether it
 * stored the photo.
 */
export async function storeSpeciesPhoto(
  prisma: PrismaClient,
  storage: PhotoStorage,
  plantId: string,
  photo: SourcePhoto,
  webp: Buffer,
  options: { replace?: boolean } = {},
): Promise<boolean> {
  const key = `species/${plantId}.webp`;
  const credit = {
    imageAuthor: photo.author,
    imageLicense: photo.license,
    imageSource: photo.source,
  };
  if (options.replace) {
    await storage.save(key, webp);
    await prisma.plant.update({
      where: { id: plantId },
      data: { imageKey: key, ...credit },
    });
    return true;
  }
  const claimed = await prisma.plant.updateMany({
    where: { id: plantId, imageKey: null },
    data: { imageKey: key, ...credit },
  });
  if (claimed.count === 0) return false;
  try {
    await storage.save(key, webp);
  } catch (error) {
    // Give the claim back, so the species doesn't point at a file that isn't there.
    await prisma.plant.updateMany({
      where: { id: plantId, imageKey: key, imageSource: photo.source },
      data: {
        imageKey: null,
        imageAuthor: null,
        imageLicense: null,
        imageSource: null,
      },
    });
    throw error;
  }
  return true;
}
