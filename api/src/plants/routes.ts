import {
  catalogPageSchema,
  catalogPlantSchema,
  difficultySchema,
  lightSchema,
} from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../errors';
import { resolveLocale } from '../i18n';
import { getCatalogPlant, listCatalog } from './service';

export function plantRoutes(app: FastifyInstance): void {
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
}
