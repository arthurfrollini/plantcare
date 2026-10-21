import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { resetDb } from '../../test/helpers';
import { buildApp } from '../app';
import {
  deleteExpiredRefreshTokens,
  hashRefreshToken,
  issueTokens,
} from './tokens';

describe('tokens', () => {
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('issueTokens stores only the hash with the configured expiry', async () => {
    const app = await buildApp({ prisma });
    const user = await prisma.user.create({
      data: { name: 'A', email: 'a@example.com' },
    });
    const { accessToken, refreshToken } = await issueTokens(prisma, user.id);
    expect(app.jwt.verify(accessToken)).toMatchObject({ sub: user.id });
    expect(Buffer.from(refreshToken, 'base64url')).toHaveLength(48);
    const row = await prisma.refreshToken.findFirstOrThrow();
    expect(row.tokenHash).toBe(hashRefreshToken(refreshToken));
    expect(row.tokenHash).not.toBe(refreshToken);
    const days = (row.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    await app.close();
  });

  it('deleteExpiredRefreshTokens removes only expired rows', async () => {
    const user = await prisma.user.create({
      data: { name: 'A', email: 'a@example.com' },
    });
    await prisma.refreshToken.createMany({
      data: [
        {
          userId: user.id,
          tokenHash: 'old',
          expiresAt: new Date(Date.now() - 1000),
        },
        {
          userId: user.id,
          tokenHash: 'fresh',
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });
    expect(await deleteExpiredRefreshTokens(prisma)).toBe(1);
    const left = await prisma.refreshToken.findMany();
    expect(left.map((r) => r.tokenHash)).toEqual(['fresh']);
  });
});
