import { userSchema, type User } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { randomBytes } from 'node:crypto';
import { toUserDto } from '../auth/service';
import { AppError } from '../errors';
import type { PhotoStorage } from '../storage';
import { contentTypeForKey } from '../user-plants/photo';
import { readPhotoUpload } from '../user-plants/photo-upload';

function unauthorized(): AppError {
  return new AppError(401, 'unauthorized', 'Missing or invalid access token');
}

export function avatarRoutes(
  app: FastifyInstance,
  storage: PhotoStorage,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const security = [{ bearerAuth: [] }];
  const tags = ['me'];

  const currentAvatarKey = async (userId: string): Promise<string | null> => {
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarPath: true },
    });
    if (!user) throw unauthorized();
    return user.avatarPath;
  };

  typed.post(
    '/me/avatar',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: 'Upload or replace the signed-in user avatar',
        description:
          'Multipart form with a `photo` file field. JPEG, PNG or WebP (detected from the file contents), up to 5 MB.',
        security,
        consumes: ['multipart/form-data'],
        response: { 200: userSchema },
      },
    },
    async (request): Promise<User> => {
      const previous = await currentAvatarKey(request.userId);
      const { data, type } = await readPhotoUpload(request);
      const key = `avatars/${request.userId}-${randomBytes(8).toString('hex')}.${type.ext}`;
      await storage.save(key, data);
      const row = await app.prisma.user.update({
        where: { id: request.userId },
        data: { avatarPath: key, avatarUpdatedAt: new Date() },
      });
      if (previous !== null && previous !== key) await storage.remove(previous);
      return toUserDto(row);
    },
  );

  typed.get(
    '/me/avatar',
    {
      onRequest: app.authenticate,
      schema: { tags, summary: 'Download the signed-in user avatar', security },
    },
    async (request, reply) => {
      const key = await currentAvatarKey(request.userId);
      const data = key === null ? null : await storage.read(key);
      if (key === null || data === null) {
        throw new AppError(404, 'avatar_not_found', 'User has no avatar');
      }
      return reply
        .header('Content-Type', contentTypeForKey(key))
        .header('Cache-Control', 'private')
        .header('X-Content-Type-Options', 'nosniff')
        .send(data);
    },
  );

  typed.delete(
    '/me/avatar',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: 'Remove the signed-in user avatar',
        description:
          'Deletes the stored file and returns the user. Answers 200 when there was no avatar.',
        security,
        response: { 200: userSchema },
      },
    },
    async (request): Promise<User> => {
      const previous = await currentAvatarKey(request.userId);
      const row = await app.prisma.user.update({
        where: { id: request.userId },
        data: { avatarPath: null, avatarUpdatedAt: null },
      });
      if (previous !== null) await storage.remove(previous);
      return toUserDto(row);
    },
  );
}
