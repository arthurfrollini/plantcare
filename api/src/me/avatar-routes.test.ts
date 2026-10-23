import type { User } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDb } from '../../test/helpers';
import type { PrismaClient } from '../generated/prisma/client';
import { createDiskStorage } from '../storage';

type ErrorBody = { error: { code: string; message: string } };

const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('jpeg body'),
]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png body'),
]);

describe('avatar routes', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let dir: string;
  let tokenA: string;
  let tokenB: string;

  const register = async (name: string, email: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: JSON.stringify({ name, email, password: 'correct horse' }),
      headers: { 'content-type': 'application/json' },
    });
    return res.json<{ accessToken: string }>().accessToken;
  };

  const upload = (
    token: string,
    file: { data: Buffer; filename: string; type: string },
  ) => {
    const boundary = '----plantcareboundary';
    return app.inject({
      method: 'POST',
      url: '/me/avatar',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`,
        ),
        file.data,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    });
  };

  const download = (token: string) =>
    app.inject({
      method: 'GET',
      url: '/me/avatar',
      headers: { authorization: `Bearer ${token}` },
    });

  const files = async () => readdir(path.join(dir, 'avatars')).catch(() => []);

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'plantcare-avatars-'));
    ({ app, prisma } = await createTestApp({
      photoStorage: createDiskStorage(dir),
    }));
  });
  beforeEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await resetDb(prisma);
    tokenA = await register('Ana', 'ana@example.com');
    tokenB = await register('Bia', 'bia@example.com');
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it('stores a JPEG and serves the same bytes', async () => {
    const res = await upload(tokenA, {
      data: jpeg,
      filename: 'a.jpg',
      type: 'image/jpeg',
    });
    expect(res.statusCode).toBe(200);
    const user = res.json<User>();
    expect(user.hasAvatar).toBe(true);
    expect(user.avatarVersion).toEqual(expect.any(String));

    const got = await download(tokenA);
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect(got.rawPayload.equals(jpeg)).toBe(true);
  });

  it('rejects a text file like plant photos do', async () => {
    const res = await upload(tokenA, {
      data: Buffer.from('hello'),
      filename: 'a.txt',
      type: 'text/plain',
    });
    expect(res.statusCode).toBe(415);
    expect(res.json<ErrorBody>().error.code).toBe('unsupported_photo_type');
    expect(await files()).toEqual([]);
  });

  it('removes the old file when replaced', async () => {
    await upload(tokenA, { data: jpeg, filename: 'a.jpg', type: 'image/jpeg' });
    const [first] = await files();
    expect(first).toMatch(/\.jpg$/);
    const res = await upload(tokenA, {
      data: png,
      filename: 'a.png',
      type: 'image/png',
    });
    expect(res.statusCode).toBe(200);
    const after = await files();
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(first);
    const got = await download(tokenA);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.rawPayload.equals(png)).toBe(true);
  });

  it('deletes the avatar and the file, and is idempotent', async () => {
    await upload(tokenA, { data: jpeg, filename: 'a.jpg', type: 'image/jpeg' });
    const res = await app.inject({
      method: 'DELETE',
      url: '/me/avatar',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<User>()).toMatchObject({
      hasAvatar: false,
      avatarVersion: null,
    });
    expect(await files()).toEqual([]);
    expect((await download(tokenA)).statusCode).toBe(404);
    const again = await app.inject({
      method: 'DELETE',
      url: '/me/avatar',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json<User>().hasAvatar).toBe(false);
  });

  it('serves only the caller their own avatar', async () => {
    await upload(tokenA, { data: jpeg, filename: 'a.jpg', type: 'image/jpeg' });
    const res = await download(tokenB);
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().error.code).toBe('avatar_not_found');
  });

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/avatar' });
    expect(res.statusCode).toBe(401);
  });

  it('shows the avatar fields on GET /me', async () => {
    const before = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(before.json<User>()).toMatchObject({
      hasAvatar: false,
      avatarVersion: null,
    });
    await upload(tokenA, { data: jpeg, filename: 'a.jpg', type: 'image/jpeg' });
    const after = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const user = after.json<User>();
    expect(user.hasAvatar).toBe(true);
    expect(user.avatarVersion).toEqual(expect.any(String));
  });
});
