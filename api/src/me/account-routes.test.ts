import type { FastifyInstance } from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDb } from '../../test/helpers';
import type { PrismaClient } from '../generated/prisma/client';
import { createDiskStorage, type PhotoStorage } from '../storage';

type ErrorBody = { error: { code: string; message: string } };
type Session = { accessToken: string; refreshToken: string; userId: string };

describe('account routes', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let dir: string;
  let storage: PhotoStorage;

  const json = { 'content-type': 'application/json' };
  const post = (url: string, payload: unknown, token?: string) =>
    app.inject({
      method: 'POST',
      url,
      payload: JSON.stringify(payload),
      headers: {
        ...json,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  const register = async (email: string): Promise<Session> => {
    const res = await post('/auth/register', {
      name: 'Ana',
      email,
      password: 'correct horse',
    });
    const body = res.json<{
      accessToken: string;
      refreshToken: string;
      user: { id: string };
    }>();
    return { ...body, userId: body.user.id };
  };
  const login = async (email: string, password: string) => {
    const res = await post('/auth/login', { email, password });
    return { res, body: res.json<{ refreshToken: string }>() };
  };
  const refresh = (refreshToken: string) =>
    post('/auth/refresh', { refreshToken });
  const changePassword = (
    s: Session,
    payload: Partial<{
      currentPassword: string;
      newPassword: string;
      refreshToken: string;
    }>,
  ) =>
    post(
      '/me/password',
      {
        currentPassword: 'correct horse',
        newPassword: 'battery staple',
        refreshToken: s.refreshToken,
        ...payload,
      },
      s.accessToken,
    );
  const getMe = (token: string) =>
    app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'plantcare-account-'));
    storage = createDiskStorage(dir);
    ({ app, prisma } = await createTestApp({ photoStorage: storage }));
  });
  beforeEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await resetDb(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  describe('POST /me/password', () => {
    it('rejects a wrong current password and changes nothing', async () => {
      const a = await register('ana@example.com');
      const res = await changePassword(a, { currentPassword: 'nope nope' });
      expect(res.statusCode).toBe(403);
      expect(res.json<ErrorBody>().error.code).toBe('wrong_password');
      expect(
        (await login('ana@example.com', 'correct horse')).res.statusCode,
      ).toBe(200);
      expect((await refresh(a.refreshToken)).statusCode).toBe(200);
    });

    it('keeps the calling device and revokes the others', async () => {
      const a = await register('ana@example.com');
      const other = await login('ana@example.com', 'correct horse');
      const res = await changePassword(a, {});
      expect(res.statusCode).toBe(204);
      expect((await refresh(other.body.refreshToken)).statusCode).toBe(401);
      expect((await refresh(a.refreshToken)).statusCode).toBe(200);
      expect(
        (await login('ana@example.com', 'battery staple')).res.statusCode,
      ).toBe(200);
      expect(
        (await login('ana@example.com', 'correct horse')).res.statusCode,
      ).toBe(401);
    });

    it('revokes everything when the presented token is not the users', async () => {
      const a = await register('ana@example.com');
      const b = await register('bia@example.com');
      const res = await changePassword(a, { refreshToken: b.refreshToken });
      expect(res.statusCode).toBe(204);
      expect((await refresh(a.refreshToken)).statusCode).toBe(401);
      expect((await refresh(b.refreshToken)).statusCode).toBe(200);
    });

    it('answers 409 for an account without a password', async () => {
      const a = await register('ana@example.com');
      await prisma.user.update({
        where: { id: a.userId },
        data: { passwordHash: null, googleId: 'g-1' },
      });
      const res = await changePassword(a, {});
      expect(res.statusCode).toBe(409);
      expect(res.json<ErrorBody>().error.code).toBe('no_password');
    });

    it('answers 400 for a 7-character new password', async () => {
      const a = await register('ana@example.com');
      const res = await changePassword(a, { newPassword: 'short77' });
      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorBody>().error.code).toBe('validation_error');
    });

    it('needs authentication', async () => {
      const res = await post('/me/password', {
        currentPassword: 'x',
        newPassword: 'battery staple',
        refreshToken: 'y',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('DELETE /me', () => {
    it('removes the user, rows and files, and leaves others alone', async () => {
      const a = await register('ana@example.com');
      const b = await register('bia@example.com');
      const catalog = await prisma.plant.create({
        data: {
          slug: 'fern',
          scientificName: 'Fernus',
          light: 'low',
          difficulty: 'easy',
          frequencyTimes: 1,
          frequencyPer: 'week',
        },
      });
      const keys = ['p1.jpg', 'p2.png', 'q1.jpg'];
      for (const key of [
        'p1.jpg',
        'p2.png',
        'q1.jpg',
        'avatars/a1.jpg',
        'avatars/b1.jpg',
      ]) {
        await storage.save(key, Buffer.from('x'));
      }
      const plant = (userId: string, photoPath: string) =>
        prisma.userPlant.create({
          data: {
            userId,
            catalogPlantId: catalog.id,
            reminderTime: '09:00',
            timeZone: 'UTC',
            photoPath,
          },
        });
      await plant(a.userId, 'p1.jpg');
      await plant(a.userId, 'p2.png');
      await plant(b.userId, 'q1.jpg');
      await prisma.user.update({
        where: { id: a.userId },
        data: { avatarPath: 'avatars/a1.jpg', avatarUpdatedAt: new Date() },
      });
      await prisma.user.update({
        where: { id: b.userId },
        data: { avatarPath: 'avatars/b1.jpg', avatarUpdatedAt: new Date() },
      });

      const res = await app.inject({
        method: 'DELETE',
        url: '/me',
        headers: { authorization: `Bearer ${a.accessToken}` },
      });
      expect(res.statusCode).toBe(204);

      expect(await storage.read('p1.jpg')).toBeNull();
      expect(await storage.read('p2.png')).toBeNull();
      expect(await storage.read('avatars/a1.jpg')).toBeNull();
      expect(await storage.read(keys[2] ?? '')).not.toBeNull();
      expect(await storage.read('avatars/b1.jpg')).not.toBeNull();

      expect(await prisma.user.count({ where: { id: a.userId } })).toBe(0);
      expect(
        await prisma.userPlant.count({ where: { userId: a.userId } }),
      ).toBe(0);
      expect(
        await prisma.refreshToken.count({ where: { userId: a.userId } }),
      ).toBe(0);
      expect(
        await prisma.userPlant.count({ where: { userId: b.userId } }),
      ).toBe(1);

      expect((await getMe(a.accessToken)).statusCode).toBe(401);
      expect(
        (await login('ana@example.com', 'correct horse')).res.statusCode,
      ).toBe(401);
      expect((await getMe(b.accessToken)).statusCode).toBe(200);
    });

    it('succeeds when a file is already missing', async () => {
      const a = await register('ana@example.com');
      await prisma.user.update({
        where: { id: a.userId },
        data: { avatarPath: 'avatars/gone.jpg', avatarUpdatedAt: new Date() },
      });
      const res = await app.inject({
        method: 'DELETE',
        url: '/me',
        headers: { authorization: `Bearer ${a.accessToken}` },
      });
      expect(res.statusCode).toBe(204);
    });
  });
});
