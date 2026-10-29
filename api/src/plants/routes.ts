import type { PhotoStorage } from '../storage';
import { contentTypeForKey } from '../user-plants/photo';
import {
  catalogPageSchema,
  catalogPlantSchema,
  difficultySchema,
  lightSchema,
  photoCreditSchema,
} from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../errors';
import { resolveLocale } from '../i18n';
import { getCatalogPlant, listCatalog, listPhotoCredits } from './service';

export function plantRoutes(app: FastifyInstance, storage: PhotoStorage): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/plants',
    {
      schema: {
        tags: ['plants'],
        summary: 'List the plant catalog',
        description:
          'Names and texts follow the Accept-Language header (pt-BR or en). Search ignores case and accents and also matches aliases and scientific names.',
        querystring: z.object({
          search: z.string().max(100).optional(),
          light: lightSchema.optional(),
          difficulty: difficultySchema.optional(),
          page: z.coerce.number().int().min(1).default(1),
        }),
        response: { 200: catalogPageSchema },
      },
    },
    (request) =>
      listCatalog(
        app.prisma,
        resolveLocale(request.headers['accept-language']),
        request.query,
      ),
  );

  typed.get(
    '/plants/credits',
    {
      schema: {
        tags: ['plants'],
        summary: 'Credits of the catalog photos',
        description:
          'Every species photo that needs a credit, with its author, licence and source page, sorted by name in the Accept-Language locale.',
        response: { 200: z.array(photoCreditSchema) },
      },
    },
    (request) =>
      listPhotoCredits(
        app.prisma,
        resolveLocale(request.headers['accept-language']),
      ),
  );

  typed.get(
    '/plants/:id',
    {
      schema: {
        tags: ['plants'],
        summary: 'Get one catalog plant',
        params: z.object({ id: z.string() }),
        response: { 200: catalogPlantSchema },
      },
    },
    async (request) => {
      const plant = await getCatalogPlant(
        app.prisma,
        resolveLocale(request.headers['accept-language']),
        request.params.id,
      );
      if (!plant) throw new AppError(404, 'plant_not_found', 'Plant not found');
      return plant;
    },
  );

  typed.get(
    '/plants/:id/image',
    {
      schema: {
        tags: ['plants'],
        summary: 'Stored species photo',
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const plant = await app.prisma.plant.findUnique({
        where: { id: request.params.id },
        select: { imageKey: true },
      });
      const data = plant?.imageKey ? await storage.read(plant.imageKey) : null;
      if (!plant?.imageKey || !data) {
        throw new AppError(404, 'not_found', 'Image not found');
      }
      return reply
        .header('content-type', contentTypeForKey(plant.imageKey))
        .header('cache-control', 'public, max-age=86400')
        .send(data);
    },
  );
}
