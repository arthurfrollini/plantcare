import { authResponseSchema, localeSchema } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { login, logout, refresh, register } from './service';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
const refreshBody = z.object({ refreshToken: z.string().min(1) });

export function authRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const rateLimited = {
    rateLimit: { max: app.authRateLimitMax, timeWindow: '1 minute' },
  };

  typed.post(
    '/auth/register',
    {
      config: rateLimited,
      schema: {
        tags: ['auth'],
        summary: 'Create an account with email and password',
        body: z.object({
          name: z.string().trim().min(1).max(60),
          email: emailSchema,
          password: z.string().min(8).max(128),
          language: localeSchema.optional(),
        }),
        response: { 201: authResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await register(app.prisma, request.body);
      return reply.code(201).send(result);
    },
  );

  typed.post(
    '/auth/login',
    {
      config: rateLimited,
      schema: {
        tags: ['auth'],
        summary: 'Log in with email and password',
        body: z.object({
          email: emailSchema,
          password: z.string().min(1).max(128),
        }),
        response: { 200: authResponseSchema },
      },
    },
    (request) => login(app.prisma, request.body),
  );

  typed.post(
    '/auth/refresh',
    {
      config: rateLimited,
      schema: {
        tags: ['auth'],
        summary: 'Exchange a refresh token for a new token pair',
        description: 'The old refresh token is invalidated.',
        body: refreshBody,
        response: { 200: authResponseSchema },
      },
    },
    (request) => refresh(app.prisma, request.body.refreshToken),
  );

  typed.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Invalidate a refresh token',
        body: refreshBody,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await logout(app.prisma, request.body.refreshToken);
      return reply.code(204).send(null);
    },
  );
}
