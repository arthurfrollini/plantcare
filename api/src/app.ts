import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import jwt from '@fastify/jwt';
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
import { createAnthropicPlantAi } from './ai/anthropic-plant-ai';
import { identifyRoutes } from './ai/identify-routes';
import type { PlantAi } from './ai/plant-ai';
import { aiConfigFromEnv, type AiConfig } from './ai/usage';
import { authenticateDecorator } from './auth/authenticate';
import { createGoogleVerifier, type GoogleVerifier } from './auth/google';
import { accessJwtConfig } from './auth/jwt-config';
import { authRoutes } from './auth/routes';
import { prisma as defaultPrisma } from './db';
import { env } from './env';
import { AppError, errorBody } from './errors';
import type { PrismaClient } from './generated/prisma/client';
import { avatarRoutes } from './me/avatar-routes';
import { accountRoutes } from './me/account-routes';
import { meRoutes } from './me/routes';
import { plantRoutes } from './plants/routes';
import { createDiskStorage, type PhotoStorage } from './storage';
import { photoRoutes } from './user-plants/photo-routes';
import { userPlantRoutes } from './user-plants/routes';
import { wateringRoutes } from './user-plants/waterings-routes';
import { healthRoutes } from './routes/health';

export type BuildAppOptions = {
  prisma?: PrismaClient;
  googleVerifier?: GoogleVerifier;
  /** Google OAuth client ids; defaults to GOOGLE_CLIENT_IDS. Empty disables Google sign-in. */
  googleClientIds?: string[];
  logger?: boolean;
  /** Requests per minute per client on the auth routes. */
  authRateLimitMax?: number;
  /** Where plant photos are kept; defaults to disk under UPLOADS_DIR. */
  photoStorage?: PhotoStorage;
  /** The model client; defaults to Claude when ANTHROPIC_API_KEY is set, otherwise AI is off. */
  plantAi?: PlantAi;
  /** AI switch and spend ceiling; defaults to the environment. */
  aiConfig?: AiConfig;
  /** Test hook: register extra routes before the app is ready. */
  extraRoutes?: (app: FastifyInstance) => void;
};

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    googleVerifier: GoogleVerifier | undefined;
    authRateLimitMax: number;
    plantAi: PlantAi | undefined;
    aiConfig: AiConfig;
  }
}

function clientErrorCode(statusCode: number): string {
  if (statusCode === 413) return 'payload_too_large';
  if (statusCode === 415) return 'unsupported_media_type';
  return 'bad_request';
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('prisma', options.prisma ?? defaultPrisma);
  const googleClientIds = options.googleClientIds ?? env.GOOGLE_CLIENT_IDS;
  app.decorate(
    'googleVerifier',
    googleClientIds.length === 0
      ? undefined
      : (options.googleVerifier ?? createGoogleVerifier(googleClientIds)),
  );
  app.decorate('authRateLimitMax', options.authRateLimitMax ?? 10);
  app.decorate('aiConfig', options.aiConfig ?? aiConfigFromEnv());
  app.decorate(
    'plantAi',
    options.plantAi ??
      (env.ANTHROPIC_API_KEY
        ? createAnthropicPlantAi({
            model: env.AI_MODEL,
            apiKey: env.ANTHROPIC_API_KEY,
          })
        : undefined),
  );

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    // The default omits PATCH and DELETE, which a browser client (the web build) needs.
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, { global: false });
  await app.register(multipart);
  await app.register(jwt, {
    secret: accessJwtConfig.secret,
    sign: {
      algorithm: accessJwtConfig.algorithm,
      expiresIn: accessJwtConfig.expiresIn,
    },
    verify: { algorithms: [accessJwtConfig.algorithm] },
  });
  authenticateDecorator(app);
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
      const issue = error.validation[0];
      const where = [
        error.validationContext,
        ...(issue?.instancePath.split('/').filter(Boolean) ?? []),
      ]
        .filter((part) => part !== undefined)
        .join('.');
      return reply
        .code(400)
        .send(
          errorBody(
            'validation_error',
            where ? `Invalid request: ${where}` : 'Invalid request',
          ),
        );
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
        .send(errorBody(clientErrorCode(statusCode), error.message));
    }
    request.log.error(error);
    return reply
      .code(500)
      .send(errorBody('internal_error', 'Internal server error'));
  });

  healthRoutes(app);
  authRoutes(app);
  meRoutes(app);
  const photoStorage =
    options.photoStorage ?? createDiskStorage(env.UPLOADS_DIR);
  plantRoutes(app, photoStorage);
  identifyRoutes(app, photoStorage);
  avatarRoutes(app, photoStorage);
  accountRoutes(app, photoStorage);
  userPlantRoutes(app, photoStorage);
  wateringRoutes(app);
  photoRoutes(app, photoStorage);
  options.extraRoutes?.(app);

  await app.ready();
  return app;
}
