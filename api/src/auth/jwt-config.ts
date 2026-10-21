import { env } from '../env';

/** Single source for signing (fast-jwt) and verifying (@fastify/jwt). */
export const ACCESS_JWT_ALGORITHM = 'HS256';
export const accessJwtConfig = {
  secret: env.JWT_SECRET,
  algorithm: ACCESS_JWT_ALGORITHM,
  expiresIn: env.ACCESS_TOKEN_TTL,
} as const;
