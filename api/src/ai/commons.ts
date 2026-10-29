import sharp from 'sharp';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client';
import type { PhotoStorage } from '../storage';

const API = 'https://commons.wikimedia.org/w/api.php';
// Commons asks API clients to say who they are.
const USER_AGENT = 'PlantCare/0.1 (arthur.frollini@gmail.com)';
const MIN_SHORT_SIDE = 800;
const SIZE = 800;
const TIMEOUT_MS = 5000;

export type CommonsPhoto = {
  /** Where to download the image (a 1600 px thumbnail when Commons offers one). */
  url: string;
  author: string;
  license: string;
  /** The file's page on Commons. */
  source: string;
};

const searchSchema = z.object({
  query: z.object({
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
                  LicenseShortName: z.object({ value: z.string() }).optional(),
                  Artist: z.object({ value: z.string() }).optional(),
                })
                .optional(),
            }),
          )
          .min(1),
      }),
    ),
  }),
});

function isPublicDomain(license: string): boolean {
  const normalized = license.trim().toLowerCase();
  return (
    normalized === 'cc0' ||
    normalized.startsWith('cc0 ') ||
    normalized.startsWith('public domain') ||
    normalized.startsWith('pd')
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

/** Candidates the check sees per species, at most: each check is a paid model call. */
export const MAX_CANDIDATES = 3;
/** The longest side of the copy sent to the check; enough to tell a plant from a coin. */
const CHECK_SIZE = 512;

/** Asks whether a photo can illustrate the species; a rejected promise counts as a no. */
export type CheckSpeciesPhoto = (photo: Buffer) => Promise<boolean>;

/**
 * Up to 3 CC0 or public-domain photos in a species' Wikimedia Commons category, in search order,
 * whose short side is at least 800 px. Empty when there is none or Commons can't answer.
 */
export function findPublicDomainPhotos(
  scientificName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CommonsPhoto[]> {
  return publicDomainPhotos(
    {
      generator: 'search',
      gsrnamespace: '6',
      // Only files filed under the species: a free-text search matches any file that names it.
      gsrsearch: `incategory:"${scientificName}" filetype:bitmap`,
      gsrlimit: '50',
    },
    fetchImpl,
  ).then((photos) => photos.slice(0, MAX_CANDIDATES));
}

/** One file picked by hand, e.g. "File:Monstera1.JPG", if it is CC0 or public domain and large enough. */
export async function findPublicDomainPhotoByTitle(
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CommonsPhoto | null> {
  const [photo] = await publicDomainPhotos({ titles: title }, fetchImpl);
  return photo ?? null;
}

async function publicDomainPhotos(
  query: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<CommonsPhoto[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    ...query,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|Artist',
    iiurlwidth: '1600',
  });
  const response = await fetchImpl(`${API}?${params.toString()}`, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return [];
  const parsed = searchSchema.safeParse(await response.json());
  if (!parsed.success) return [];

  const pages = Object.values(parsed.data.query.pages).sort(
    (a, b) => a.index - b.index,
  );
  const photos: CommonsPhoto[] = [];
  for (const page of pages) {
    const [info] = page.imageinfo;
    const license = info?.extmetadata?.LicenseShortName?.value;
    if (!info || !license || !isPublicDomain(license)) continue;
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

/**
 * Gives a new species a public-domain photo that the check approves, cropped square to 800 px as
 * WebP, with its credit. Tries up to 3 candidates in search order. Never throws: on any failure,
 * or when every candidate is rejected, the species keeps the placeholder.
 */
export async function attachSpeciesPhoto(options: {
  prisma: PrismaClient;
  storage: PhotoStorage;
  plantId: string;
  scientificName: string;
  check: CheckSpeciesPhoto;
  fetchImpl?: typeof fetch;
  log?: (message: string, error?: unknown) => void;
}): Promise<void> {
  const { scientificName, check, fetchImpl = fetch, log = () => {} } = options;
  try {
    for (const photo of await findPublicDomainPhotos(
      scientificName,
      fetchImpl,
    )) {
      const original = await downloadPhoto(photo, fetchImpl);
      if (!original) continue;
      const approved = await check(await photoForCheck(original)).catch(
        (error: unknown) => {
          log(`Could not check a Commons photo of ${scientificName}`, error);
          return false;
        },
      );
      if (!approved) continue;
      await storeSpeciesPhoto(
        options.prisma,
        options.storage,
        options.plantId,
        photo,
        original,
      );
      return;
    }
    log(`No suitable Commons photo for ${scientificName}`);
  } catch (error) {
    log(`Could not attach a Commons photo to ${scientificName}`, error);
  }
}

/** The full-size photo from Commons, or null when the download fails. */
export async function downloadPhoto(
  photo: CommonsPhoto,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer | null> {
  const response = await fetchImpl(photo.url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

/** Crops a downloaded photo square to 800 px as WebP, and stores it with its credit. */
export async function storeSpeciesPhoto(
  prisma: PrismaClient,
  storage: PhotoStorage,
  plantId: string,
  photo: CommonsPhoto,
  original: Buffer,
): Promise<void> {
  const webp = await sharp(original)
    .rotate()
    .resize(SIZE, SIZE, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer();
  const key = `species/${plantId}.webp`;
  await storage.save(key, webp);
  await prisma.plant.update({
    where: { id: plantId },
    data: {
      imageKey: key,
      imageAuthor: photo.author,
      imageLicense: photo.license,
      imageSource: photo.source,
    },
  });
}
