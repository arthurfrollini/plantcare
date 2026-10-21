import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../errors';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    userId: string;
  }
}

const accessPayloadSchema = z.object({ sub: z.string().min(1) });

export function authenticateDecorator(app: FastifyInstance): void {
  app.decorateRequest('userId', '');
  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      const payload = accessPayloadSchema.parse(await request.jwtVerify());
      request.userId = payload.sub;
    } catch {
      throw new AppError(
        401,
        'unauthorized',
        'Missing or invalid access token',
      );
    }
  });
}
