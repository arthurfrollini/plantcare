import { userPlantSchema } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../errors';
import { resolveLocale } from '../i18n';
import type { PhotoStorage } from '../storage';
import { contentTypeForKey, detectPhotoType } from './photo';
import { getPhotoKey, setUserPlantPhoto } from './service';

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

export function photoRoutes(app: FastifyInstance, storage: PhotoStorage): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const security = [{ bearerAuth: [] }];
  const tags = ['user-plants'];
  const params = z.object({ id: z.string() });

  typed.post(
    '/me/plants/:id/photo',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: "Upload or replace a plant's photo",
        description:
          'Multipart form with a `photo` file field. JPEG, PNG or WebP (detected from the file contents), up to 5 MB.',
        security,
        params,
        consumes: ['multipart/form-data'],
        response: { 200: userPlantSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      await getPhotoKey(app.prisma, request.userId, id);
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
      return setUserPlantPhoto(
        app.prisma,
        storage,
        request.userId,
        id,
        resolveLocale(request.headers['accept-language']),
        `${id}.${type.ext}`,
        data,
      );
    },
  );

  typed.get(
    '/me/plants/:id/photo',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: "Download a plant's photo",
        security,
        params,
      },
    },
    async (request, reply) => {
      const key = await getPhotoKey(
        app.prisma,
        request.userId,
        request.params.id,
      );
      const data = key === null ? null : await storage.read(key);
      if (key === null || data === null) {
        throw new AppError(404, 'photo_not_found', 'Plant has no photo');
      }
      return reply
        .header('Content-Type', contentTypeForKey(key))
        .header('Cache-Control', 'private')
        .send(data);
    },
  );
}
