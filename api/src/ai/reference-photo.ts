import sharp from 'sharp';
import type { PrismaClient } from '../generated/prisma/client';
import type { PhotoStorage } from '../storage';
import {
  downloadPhoto,
  findCommonsPhotos,
  MIN_SHORT_SIDE,
  photoForCheck,
  storeSpeciesPhoto,
  toSpeciesWebp,
  type CheckSpeciesPhoto,
  type SourcePhoto,
} from './commons';
import { findINaturalistPhotos } from './inaturalist';

/** Checks per species, at most: each is a paid model call. */
const MAX_CHECKS = 4;

/**
 * What a search for a species photo ended with. `unavailable` means no candidate could be checked
 * because a source or a download failed: a later search may still find one.
 */
export type ReferenceSearch =
  | { status: 'found'; photo: SourcePhoto; webp: Buffer }
  | { status: 'notFound' }
  | { status: 'unavailable' };

const EXPIRED = Symbol('expired');

/**
 * A photo for a species that the check approves: Commons first, then iNaturalist, stopping at the
 * first approval or the deadline. Never throws.
 */
export async function findReferencePhoto(options: {
  scientificName: string;
  check: CheckSpeciesPhoto;
  fetchImpl?: typeof fetch;
  deadlineMs?: number;
  log?: (message: string, error?: unknown) => void;
}): Promise<ReferenceSearch> {
  const {
    scientificName,
    check,
    fetchImpl = fetch,
    deadlineMs = 15_000,
    log = () => {},
  } = options;
  const deadline = AbortSignal.timeout(deadlineMs);
  const expired = new Promise<typeof EXPIRED>((resolve) =>
    deadline.addEventListener('abort', () => resolve(EXPIRED), { once: true }),
  );
  const beforeDeadline = <T>(work: Promise<T>) => Promise.race([work, expired]);

  let checks = 0;
  // A source or a download that failed, or the deadline: the answer may be different later.
  let failed = false;
  try {
    for (const source of [findCommonsPhotos, findINaturalistPhotos]) {
      const photos = await beforeDeadline(source(scientificName, fetchImpl));
      if (photos === EXPIRED) {
        failed = true;
        break;
      }
      if (photos === null) {
        failed = true;
        continue;
      }
      for (const photo of photos) {
        if (checks >= MAX_CHECKS) break;
        const original = await beforeDeadline(downloadPhoto(photo, fetchImpl));
        if (original === EXPIRED) return ended();
        if (original === null) {
          failed = true;
          continue;
        }
        const { width = 0, height = 0 } = await sharp(original).metadata();
        if (Math.min(width, height) < MIN_SHORT_SIDE) continue;
        checks++;
        const approved = await beforeDeadline(
          photoForCheck(original)
            .then(check)
            .catch((error: unknown) => {
              log(`Could not check a photo of ${scientificName}`, error);
              return false;
            }),
        );
        if (approved === EXPIRED) return ended();
        if (approved) {
          return {
            status: 'found',
            photo,
            webp: await toSpeciesWebp(original),
          };
        }
      }
    }
  } catch (error) {
    log(`Could not search a photo of ${scientificName}`, error);
    failed = true;
  }
  return ended();

  function ended(): ReferenceSearch {
    if (deadline.aborted) failed = true;
    return checks === 0 && failed
      ? { status: 'unavailable' }
      : { status: 'notFound' };
  }
}

/**
 * Gives a new species a freely licensed photo that the check approves, cropped square to 800 px as
 * WebP, with its credit. Never throws: on any failure, or when every candidate is rejected, the
 * species keeps the placeholder.
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
  const { scientificName, log = () => {} } = options;
  try {
    const found = await findReferencePhoto(options);
    if (found.status !== 'found') {
      log(`No suitable photo for ${scientificName} (${found.status})`);
      return;
    }
    await storeSpeciesPhoto(
      options.prisma,
      options.storage,
      options.plantId,
      found.photo,
      found.webp,
    );
  } catch (error) {
    log(`Could not attach a photo to ${scientificName}`, error);
  }
}
