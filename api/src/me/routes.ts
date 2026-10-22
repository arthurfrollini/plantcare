import { localeSchema, userNameSchema, userSchema } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { toUserDto } from '../auth/service';
import { AppError } from '../errors';
import { Prisma } from '../generated/prisma/client';

function unauthorized(): AppError {
  return new AppError(401, 'unauthorized', 'Missing or invalid access token');
}

export function meRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const security = [{ bearerAuth: [] }];

  typed.get(
    '/me',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['me'],
        summary: 'Get the signed-in user',
        security,
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const user = await app.prisma.user.findUnique({
        where: { id: request.userId },
      });
      if (!user) throw unauthorized();
      return toUserDto(user);
    },
  );

  typed.patch(
    '/me',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['me'],
        summary: 'Update the signed-in user',
        security,
        body: z.object({
          name: userNameSchema.optional(),
          language: localeSchema.optional(),
        }),
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const { name, language } = request.body;
      try {
        const user = await app.prisma.user.update({
          where: { id: request.userId },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(language !== undefined ? { language } : {}),
          },
        });
        return toUserDto(user);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          throw unauthorized();
        }
        throw error;
      }
    },
  );
}
