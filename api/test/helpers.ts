import type { FastifyInstance } from 'fastify';
import { buildApp, type BuildAppOptions } from '../src/app';
import { prisma as testPrisma } from '../src/db';
import type { PrismaClient } from '../src/generated/prisma/client';

export async function createTestApp(
  options: BuildAppOptions = {},
): Promise<{ app: FastifyInstance; prisma: PrismaClient }> {
  const prisma = options.prisma ?? testPrisma;
  const app = await buildApp({
    authRateLimitMax: 1000,
    // Tests never reach Wikimedia Commons; a test that needs it passes its own stub.
    commonsFetch: () => Promise.reject(new Error('No network in tests')),
    ...options,
    prisma,
  });
  return { app, prisma };
}

export async function resetDb(
  prisma: PrismaClient = testPrisma,
): Promise<void> {
  const rows = await prisma.$queryRaw<
    { name: string }[]
  >`SELECT current_database() AS name`;
  const name = rows[0]?.name ?? '';
  if (!name.endsWith('_test')) {
    throw new Error(
      `resetDb refuses to truncate "${name}": database name must end in _test`,
    );
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "UserPlant", "RefreshToken", "PlantAlias", "PlantTranslation", "Plant", "User" RESTART IDENTITY CASCADE',
  );
}
