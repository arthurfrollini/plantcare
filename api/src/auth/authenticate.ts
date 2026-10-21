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
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    try {
      const payload = accessPayloadSchema.parse(app.jwt.verify(token));
      request.userId = payload.sub;
    } catch {
      throw new AppError(
        401,
        'unauthorized',
        'Missing or invalid access token',
      );
    }
    await Promise.resolve();
  });
}
