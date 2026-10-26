import { localDateSchema, userPlantSchema } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { resolveLocale } from '../i18n';
import { markWatered, unmarkWatered } from './service';

export function wateringRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const security = [{ bearerAuth: [] }];
  const tags = ['user-plants'];

  typed.post(
    '/me/plants/:id/waterings',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: 'Mark a plant as watered on a day',
        description:
          "wateredOn is the device's local date (YYYY-MM-DD). Returns 201 when recorded and 200 when that day was already marked. A date more than one day from today in the plant's time zone is rejected with 400 invalid_watering_date.",
        security,
        params: z.object({ id: z.string() }),
        body: z.object({ wateredOn: localDateSchema }),
        response: { 200: userPlantSchema, 201: userPlantSchema },
      },
    },
    async (request, reply) => {
      const { plant, created } = await markWatered(
        app.prisma,
        request.userId,
        request.params.id,
        resolveLocale(request.headers['accept-language']),
        request.body.wateredOn,
      );
      return reply.code(created ? 201 : 200).send(plant);
    },
  );

  typed.delete(
    '/me/plants/:id/waterings/:wateredOn',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: 'Undo a watering',
        description:
          'Returns the plant with 200 whether or not that day was marked.',
        security,
        params: z.object({ id: z.string(), wateredOn: localDateSchema }),
        response: { 200: userPlantSchema },
      },
    },
    (request) =>
      unmarkWatered(
        app.prisma,
        request.userId,
        request.params.id,
        resolveLocale(request.headers['accept-language']),
        request.params.wateredOn,
      ),
  );
}
