import {
  createUserPlantSchema,
  updateUserPlantSchema,
  userPlantSchema,
} from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { resolveLocale } from '../i18n';
import type { PhotoStorage } from '../storage';
import {
  createUserPlant,
  deleteUserPlant,
  listUserPlants,
  updateUserPlant,
} from './service';

export function userPlantRoutes(
  app: FastifyInstance,
  storage: PhotoStorage,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const security = [{ bearerAuth: [] }];
  const tags = ['user-plants'];
  const params = z.object({ id: z.string() });

  typed.get(
    '/me/plants',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: "List the signed-in user's plants",
        description:
          'Ordered by reminder time of day, then species name. Frequency, light and difficulty come from the species; texts follow Accept-Language. When the species frequency no longer matches the stored watering days, scheduleNeedsReview is true and wateringDays is empty.',
        security,
        response: { 200: z.array(userPlantSchema) },
      },
    },
    (request) =>
      listUserPlants(
        app.prisma,
        request.userId,
        resolveLocale(request.headers['accept-language']),
      ),
  );

  typed.post(
    '/me/plants',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: 'Add a plant',
        description:
          'Frequency and light belong to the species. wateringDays must be empty or have one day per watering (ISO weekdays, 1 = Monday); otherwise 400 invalid_watering_days. Reminder time is HH:00 or HH:30; the lead defaults to 15 minutes.',
        security,
        body: createUserPlantSchema,
        response: { 201: userPlantSchema },
      },
    },
    async (request, reply) => {
      const plant = await createUserPlant(
        app.prisma,
        request.userId,
        resolveLocale(request.headers['accept-language']),
        request.body,
      );
      return reply.code(201).send(plant);
    },
  );

  typed.patch(
    '/me/plants/:id',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: 'Update a plant',
        description:
          'The species cannot change, so catalogPlantId, frequency and light are rejected. A null nickname or notes clears it. Changing wateringDays or reminderTime recomputes the anchor date of every-two-weeks and monthly plants.',
        security,
        params,
        body: updateUserPlantSchema,
        response: { 200: userPlantSchema },
      },
    },
    (request) =>
      updateUserPlant(
        app.prisma,
        request.userId,
        request.params.id,
        resolveLocale(request.headers['accept-language']),
        request.body,
      ),
  );

  typed.delete(
    '/me/plants/:id',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: 'Remove a plant',
        security,
        params,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await deleteUserPlant(
        app.prisma,
        storage,
        request.userId,
        request.params.id,
      );
      return reply.code(204).send(null);
    },
  );
}
