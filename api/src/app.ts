import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import fastifyStatic from '@fastify/static';
import scalar from '@scalar/fastify-api-reference';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { fileURLToPath } from 'node:url';
import type { GoogleVerifier } from './auth/google';
import { prisma as defaultPrisma } from './db';
import { env } from './env';
import { AppError, errorBody } from './errors';
import type { PrismaClient } from './generated/prisma/client';
import { plantRoutes } from './plants/routes';
import { healthRoutes } from './routes/health';

export type BuildAppOptions = {
  prisma?: PrismaClient;
  googleVerifier?: GoogleVerifier;
  logger?: boolean;
  /** Requests per minute per client on the auth routes. */
  authRateLimitMax?: number;
};

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    googleVerifier: GoogleVerifier | undefined;
    authRateLimitMax: number;
  }
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('prisma', options.prisma ?? defaultPrisma);
  app.decorate('googleVerifier', options.googleVerifier);
  app.decorate('authRateLimitMax', options.authRateLimitMax ?? 10);

  await app.register(cors, { origin: env.CORS_ORIGIN });
  await app.register(rateLimit, { global: false });
  await app.register(swagger, {
    openapi: {
      info: { title: 'PlantCare API', version: '0.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(scalar, { routePrefix: '/docs' });
  await app.register(fastifyStatic, {
    root: fileURLToPath(new URL('../public/', import.meta.url)),
    prefix: '/static/',
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send(errorBody('not_found', 'Route not found'));
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .code(error.statusCode)
        .send(errorBody(error.code, error.message));
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply
        .code(400)
        .send(errorBody('validation_error', 'Request validation failed'));
    }
    if (isResponseSerializationError(error)) {
      request.log.error(error);
      return reply
        .code(500)
        .send(errorBody('internal_error', 'Internal server error'));
    }
    const statusCode =
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (statusCode === 429) {
      return reply
        .code(429)
        .send(errorBody('rate_limited', 'Too many requests, slow down'));
    }
    if (error instanceof Error && statusCode >= 400 && statusCode < 500) {
      return reply
        .code(statusCode)
        .send(errorBody('bad_request', error.message));
    }
    request.log.error(error);
    return reply
      .code(500)
      .send(errorBody('internal_error', 'Internal server error'));
  });

  healthRoutes(app);
  plantRoutes(app);

  await app.ready();
  return app;
}
