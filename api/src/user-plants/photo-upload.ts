import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../errors';
import { detectPhotoType, type PhotoType } from './photo';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const LIMIT_ERRORS = new Set([
  'FST_REQ_FILE_TOO_LARGE',
  'FST_FIELDS_LIMIT',
  'FST_PARTS_LIMIT',
  'FST_FILES_LIMIT',
]);

/** Size, field-count and part-count limit errors all map to 413. */
function isTooLarge(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    LIMIT_ERRORS.has(error.code)
  );
}

const truncationSchema = z.object({
  valueTruncated: z.boolean().optional(),
  fieldnameTruncated: z.boolean().optional(),
});

/** busboy truncates over-long field values silently; reject them instead. */
function hasTruncatedField(fields: object): boolean {
  return Object.values(fields).some((entry) =>
    (Array.isArray(entry) ? entry : [entry]).some((field) => {
      const parsed = truncationSchema.safeParse(field);
      return (
        parsed.success &&
        (parsed.data.valueTruncated === true ||
          parsed.data.fieldnameTruncated === true)
      );
    }),
  );
}

/**
 * Reads the multipart `photo` field of a request: enforces the size caps and
 * detects the image type from its contents. Shared by plant photos and avatars.
 */
export async function readPhotoUpload(
  request: FastifyRequest,
): Promise<{ data: Buffer; type: PhotoType }> {
  if (!request.isMultipart()) {
    throw new AppError(400, 'photo_missing', 'A photo file is required');
  }
  let part;
  try {
    part = await request.file({
      limits: {
        fileSize: MAX_PHOTO_BYTES,
        files: 1,
        fields: 5,
        fieldSize: 1024,
        parts: 6,
      },
    });
  } catch (error) {
    if (isTooLarge(error)) {
      throw new AppError(413, 'photo_too_large', 'Photo exceeds 5 MB');
    }
    throw error;
  }
  if (!part || part.fieldname !== 'photo') {
    throw new AppError(400, 'photo_missing', 'A photo file is required');
  }
  if (hasTruncatedField(part.fields)) {
    throw new AppError(413, 'photo_too_large', 'Form field is too large');
  }
  let data: Buffer;
  try {
    data = await part.toBuffer();
  } catch (error) {
    if (isTooLarge(error)) {
      throw new AppError(413, 'photo_too_large', 'Photo exceeds 5 MB');
    }
    throw error;
  }
  const type = detectPhotoType(data);
  if (!type) {
    throw new AppError(
      415,
      'unsupported_photo_type',
      'Photo must be a JPEG, PNG or WebP image',
    );
  }
  return { data, type };
}
