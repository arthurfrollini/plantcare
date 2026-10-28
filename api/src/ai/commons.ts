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
        index: z.number(),
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

/**
 * The first CC0 or public-domain photo for a species on Wikimedia Commons, in search order, whose
 * short side is at least 800 px. Null when there is none or Commons can't answer.
 */
export async function findPublicDomainPhoto(
  scientificName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CommonsPhoto | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${scientificName} filetype:bitmap`,
    gsrlimit: '50',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|Artist',
    iiurlwidth: '1600',
  });
  const response = await fetchImpl(`${API}?${params.toString()}`, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const parsed = searchSchema.safeParse(await response.json());
  if (!parsed.success) return null;

  const pages = Object.values(parsed.data.query.pages).sort(
    (a, b) => a.index - b.index,
  );
  for (const page of pages) {
    const [info] = page.imageinfo;
    const license = info?.extmetadata?.LicenseShortName?.value;
    if (!info || !license || !isPublicDomain(license)) continue;
    if (Math.min(info.width, info.height) < MIN_SHORT_SIDE) continue;
    return {
      url: info.thumburl ?? info.url,
      author: plainText(info.extmetadata?.Artist?.value ?? '') || 'Unknown',
      license,
      source: info.descriptionurl,
    };
  }
  return null;
}

/**
 * Gives a new species a public-domain photo, cropped square to 800 px as WebP, with its credit.
 * Runs after the user's plant is saved and never throws: on any failure the species keeps the
 * placeholder.
 */
export async function attachSpeciesPhoto(
  prisma: PrismaClient,
  storage: PhotoStorage,
  plantId: string,
  scientificName: string,
  fetchImpl: typeof fetch = fetch,
  log: (message: string, error?: unknown) => void = () => {},
): Promise<void> {
  try {
    const photo = await findPublicDomainPhoto(scientificName, fetchImpl);
    if (!photo) return;
    const response = await fetchImpl(photo.url, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return;
    const original = Buffer.from(await response.arrayBuffer());
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
  } catch (error) {
    log(`Could not attach a Commons photo to ${scientificName}`, error);
  }
}
