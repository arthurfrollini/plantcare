import { changePasswordSchema } from '@plantcare/shared';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { hashRefreshToken } from '../auth/tokens';
import { BCRYPT_COST } from '../auth/service';
import { AppError } from '../errors';
import { Prisma } from '../generated/prisma/client';
import type { PhotoStorage } from '../storage';

function unauthorized(): AppError {
  return new AppError(401, 'unauthorized', 'Missing or invalid access token');
}

export function accountRoutes(
  app: FastifyInstance,
  storage: PhotoStorage,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const security = [{ bearerAuth: [] }];
  const tags = ['me'];

  typed.post(
    '/me/password',
    {
      onRequest: app.authenticate,
      config: {
        rateLimit: { max: app.authRateLimitMax, timeWindow: '1 minute' },
      },
      schema: {
        tags,
        summary: 'Change the signed-in user password',
        description:
          'Keeps the session identified by `refreshToken` and revokes every other refresh token of the user.',
        security,
        body: changePasswordSchema,
      },
    },
    async (request, reply) => {
      const { currentPassword, newPassword, refreshToken } = request.body;
      const user = await app.prisma.user.findUnique({
        where: { id: request.userId },
      });
      if (!user) throw unauthorized();
      if (user.passwordHash === null) {
        throw new AppError(409, 'no_password', 'Account has no password');
      }
      if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
        throw new AppError(
          403,
          'wrong_password',
          'Current password is incorrect',
        );
      }
      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
      await app.prisma.$transaction([
        app.prisma.user.update({
          where: { id: user.id },
          data: { passwordHash },
        }),
        app.prisma.refreshToken.deleteMany({
          where: {
            userId: user.id,
            tokenHash: { not: hashRefreshToken(refreshToken) },
          },
        }),
      ]);
      return reply.code(204).send();
    },
  );

  typed.delete(
    '/me',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: 'Delete the signed-in account',
        description:
          'Deletes the user, their plants and sessions, then their stored photos and avatar.',
        security,
      },
    },
    async (request, reply) => {
      const user = await app.prisma.user.findUnique({
        where: { id: request.userId },
        select: {
          avatarPath: true,
          plants: {
            select: {
              photoPath: true,
              checkups: { select: { photoKey: true } },
            },
          },
          aiProposals: { select: { photoKey: true, referenceKey: true } },
        },
      });
      if (!user) throw unauthorized();
      const keys: string[] = [];
      for (const plant of user.plants) {
        if (plant.photoPath !== null) keys.push(plant.photoPath);
        for (const checkup of plant.checkups) {
          if (checkup.photoKey) keys.push(checkup.photoKey);
        }
      }
      for (const proposal of user.aiProposals) {
        if (proposal.photoKey !== null) keys.push(proposal.photoKey);
        if (proposal.referenceKey !== null) keys.push(proposal.referenceKey);
      }
      if (user.avatarPath !== null) keys.push(user.avatarPath);

      try {
        await app.prisma.user.delete({ where: { id: request.userId } });
      } catch (error) {
        // A concurrent call deleted the account between the read and here.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          throw unauthorized();
        }
        throw error;
      }
      for (const key of keys) {
        try {
          await storage.remove(key);
        } catch (error) {
          request.log.warn(error, 'could not remove file of deleted account');
        }
      }
      return reply.code(204).send();
    },
  );
}
