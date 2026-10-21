import { createHash, randomBytes } from 'node:crypto';
import { createSigner } from 'fast-jwt';
import { env } from '../env';
import type { PrismaClient } from '../generated/prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

const signAccessToken = createSigner({
  key: env.JWT_SECRET,
  expiresIn: env.ACCESS_TOKEN_TTL,
});

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueTokens(
  prisma: PrismaClient,
  userId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ sub: userId });
  const refreshToken = randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    },
  });
  return { accessToken, refreshToken };
}

export async function deleteExpiredRefreshTokens(
  prisma: PrismaClient,
): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
