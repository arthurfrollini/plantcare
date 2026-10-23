import { userPlantSchema } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../errors';
import { resolveLocale } from '../i18n';
import type { PhotoStorage } from '../storage';
import { contentTypeForKey } from './photo';
import { readPhotoUpload } from './photo-upload';
import {
  getPhotoKey,
  removeUserPlantPhoto,
  setUserPlantPhoto,
} from './service';

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
      const { data, type } = await readPhotoUpload(request);
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
        .header('X-Content-Type-Options', 'nosniff')
        .send(data);
    },
  );

  typed.delete(
    '/me/plants/:id/photo',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: "Remove a plant's photo",
        description:
          'Deletes the stored file and returns the plant. Answers 200 when there was no photo.',
        security,
        params,
        response: { 200: userPlantSchema },
      },
    },
    (request) =>
      removeUserPlantPhoto(
        app.prisma,
        storage,
        request.userId,
        request.params.id,
        resolveLocale(request.headers['accept-language']),
      ),
  );
}
